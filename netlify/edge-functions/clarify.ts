// Netlify Edge Function (Deno runtime) — registered in netlify.toml against /api/clarify.
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_GOAL_LENGTH = 2_000;

const CLARIFY_PROMPT = `You are FocusFlow AI, a productivity assistant. A user gave you a goal. Ask a few short clarifying questions that would help you create a better, more personalized action plan for them.

Rules:
- Ask 2 to 4 questions, no more.
- Each question must be short (under 15 words) and directly useful for planning: timeline, current experience level, constraints, budget, specific sub-goal, or available resources.
- Do not ask questions unrelated to planning the goal, and do not explain your reasoning.`;

// A schema-constrained response means OpenAI itself refuses to return
// anything but a string array under "questions" — no regex-extraction guess
// to make on our end, and no risk of a stray non-string slipping through.
const CLARIFY_SCHEMA = {
  type: 'object',
  properties: {
    questions: { type: 'array', items: { type: 'string' } },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

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
function parseQuestions(content: string): string[] {
  try {
    const parsed = JSON.parse(content) as { questions?: unknown[] };
    return Array.isArray(parsed.questions)
      ? parsed.questions.filter((q): q is string => typeof q === 'string' && q.trim().length > 0)
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

  try {
    const response = await fetchOpenAI(
      {
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: CLARIFY_PROMPT },
          { role: 'user', content: goal },
        ],
        max_completion_tokens: 300,
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'clarifying_questions', strict: true, schema: CLARIFY_SCHEMA },
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
    const questions = parseQuestions(content);

    if (questions.length === 0) {
      return json({ error: 'AI returned an unexpected response. Try wording the goal differently.' }, 502);
    }

    return json({ questions });
  } catch (error) {
    console.error('AI function error:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'AI service is temporarily unavailable.' }, 502);
  }
};
