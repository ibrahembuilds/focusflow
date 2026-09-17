// Netlify Edge Function (Deno runtime) — registered in netlify.toml against /api/decompose.
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_GOAL_LENGTH = 2_000;

const DECOMPOSE_PROMPT = `You are FocusFlow AI, a productivity assistant. Break the user's goal into practical subtasks.

Rules:
- Start every subtask's text with a clear verb.
- Create 4-8 subtasks in a logical, sequential order.
- Keep each subtask small enough to finish in one or two focus sessions.
- priority reflects how urgent/foundational the step is: "high" for blocking or time-sensitive steps, "medium" for normal steps, "low" for optional or nice-to-have steps.
- estimatedSessions is a whole number from 1 to 4 — a realistic guess at how many 25-minute focus sessions the subtask takes.
- Use simple, direct language.`;

// A schema-constrained response (below) means OpenAI itself refuses to
// return anything that doesn't match this shape — the model can't hand back
// a missing field or a priority outside the enum, so there's no longer a
// regex-extraction guess to make on our end.
const DECOMPOSE_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          estimatedSessions: { type: 'integer', minimum: 1, maximum: 4 },
        },
        required: ['text', 'priority', 'estimatedSessions'],
        additionalProperties: false,
      },
    },
  },
  required: ['tasks'],
  additionalProperties: false,
} as const;

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

type Priority = 'low' | 'medium' | 'high';

interface DecomposedTask {
  text: string;
  priority: Priority;
  estimatedSessions: number;
}

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

/**
 * The schema above already guarantees this shape came back from OpenAI — the
 * only thing left to guard against is a response cut short by the token
 * limit, which produces syntactically invalid JSON no schema can prevent.
 */
function parseTasks(content: string): DecomposedTask[] {
  try {
    const parsed = JSON.parse(content) as { tasks?: DecomposedTask[] };
    return Array.isArray(parsed.tasks)
      ? parsed.tasks.filter((task) => typeof task.text === 'string' && task.text.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

/**
 * One retry, and only for the failure modes a second attempt can plausibly
 * fix: a dropped connection, or OpenAI's own 5xx. A 4xx (bad key, bad
 * request) will fail identically the second time, so it isn't retried.
 */
async function fetchOpenAI(payload: unknown, apiKey: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
      });
      if (response.ok || response.status < 500) return response;
      lastError = new Error(`OpenAI responded ${response.status}`);
    } catch (cause) {
      lastError = cause;
    }
    if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw lastError;
}

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405);
  }

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    return json({ error: 'AI is not configured. Add OPENAI_API_KEY in Netlify site settings.' }, 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const goal =
    typeof body === 'object' && body !== null && 'goal' in body && typeof (body as any).goal === 'string'
      ? (body as any).goal.trim()
      : '';

  if (!goal) return json({ error: 'Enter a goal first.' }, 400);
  if (goal.length > MAX_GOAL_LENGTH) {
    return json({ error: 'Keep the goal under 2,000 characters.' }, 400);
  }

  const rawAnswers =
    typeof body === 'object' && body !== null && 'answers' in body && Array.isArray((body as any).answers)
      ? (body as any).answers
      : [];

  const answers: { question: string; answer: string }[] = rawAnswers
    .filter(
      (a: any) =>
        a && typeof a.question === 'string' && typeof a.answer === 'string' && a.answer.trim().length > 0,
    )
    .map((a: any) => ({ question: a.question.trim(), answer: a.answer.trim().slice(0, 300) }))
    .slice(0, 6);

  const userContent =
    answers.length > 0
      ? `Goal: ${goal}\n\nAdditional context from the user:\n${answers
          .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
          .join('\n')}`
      : goal;

  try {
    const response = await fetchOpenAI(
      {
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-5.6-luna',
        messages: [
          { role: 'system', content: DECOMPOSE_PROMPT },
          { role: 'user', content: userContent },
        ],
        // max_completion_tokens (not the legacy max_tokens) and no custom
        // temperature — newer model generations reject both of those.
        max_completion_tokens: 800,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'decomposed_tasks', strict: true, schema: DECOMPOSE_SCHEMA },
        },
      },
      apiKey,
    );

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      console.error('OpenAI request failed:', response.status, errorBody);
      return json({ error: 'AI could not process this goal. Try again shortly.' }, 502);
    }

    const result = (await response.json()) as OpenAIResponse;
    const content = result.choices?.[0]?.message?.content?.trim() ?? '';
    const tasks = parseTasks(content);

    if (tasks.length === 0) {
      return json({ error: 'AI returned an unexpected response. Try wording the goal differently.' }, 502);
    }

    return json({ tasks });
  } catch (error) {
    console.error('AI function error:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'AI service is temporarily unavailable.' }, 502);
  }
};
