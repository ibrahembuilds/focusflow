// Netlify Edge Function (Deno runtime) — registered in netlify.toml against /api/decompose.
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_GOAL_LENGTH = 2_000;

const DECOMPOSE_PROMPT = `You are FocusFlow AI, a productivity assistant. Break the user's goal into practical subtasks.

Rules:
- Return a JSON object of the shape {"tasks": [{"text": string, "priority": "low"|"medium"|"high", "estimatedSessions": number}]}.
- Start every subtask's text with a clear verb.
- Create 4-8 subtasks in a logical, sequential order.
- Keep each subtask small enough to finish in one or two focus sessions.
- priority reflects how urgent/foundational the step is: "high" for blocking or time-sensitive steps, "medium" for normal steps, "low" for optional or nice-to-have steps.
- estimatedSessions is a whole number from 1 to 4 — a realistic guess at how many 25-minute focus sessions the subtask takes.
- Use simple, direct language. Return only the JSON object, no other text.`;

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

function parseTasks(content: string): DecomposedTask[] {
  const objectMatch = content.match(/\{[\s\S]*\}/);
  const candidate = objectMatch?.[0] ?? content;

  try {
    const parsed: unknown = JSON.parse(candidate);
    const rawTasks =
      parsed && typeof parsed === 'object' && 'tasks' in parsed && Array.isArray((parsed as any).tasks)
        ? (parsed as any).tasks
        : Array.isArray(parsed)
          ? parsed
          : [];

    return rawTasks.reduce<DecomposedTask[]>((acc, item) => {
      const text = typeof item === 'string' ? item : typeof item?.text === 'string' ? item.text : '';
      if (!text.trim()) return acc;

      const priority: Priority =
        item?.priority === 'high' || item?.priority === 'low' ? item.priority : 'medium';
      const estimatedSessions =
        typeof item?.estimatedSessions === 'number' && Number.isFinite(item.estimatedSessions)
          ? Math.min(4, Math.max(1, Math.round(item.estimatedSessions)))
          : 1;

      acc.push({ text: text.trim(), priority, estimatedSessions });
      return acc;
    }, []);
  } catch {
    return [];
  }
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
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: DECOMPOSE_PROMPT },
          { role: 'user', content: goal },
        ],
        // max_completion_tokens (not the legacy max_tokens) and no custom
        // temperature — newer model generations reject both of those.
        max_completion_tokens: 800,
        response_format: { type: 'json_object' },
      }),
    });

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
