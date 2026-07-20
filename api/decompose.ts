const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MAX_GOAL_LENGTH = 2_000;

const DECOMPOSE_PROMPT = `You are FocusFlow AI, a productivity assistant. Break the user's goal into practical subtasks.

Rules:
- Return only a JSON array of strings.
- Start every subtask with a clear verb.
- Create 4-8 subtasks in a logical order.
- Keep each subtask small enough for one focus session.
- Use simple, direct language.`;

type OpenRouterResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseTasks(content: string): string[] {
  const arrayMatch = content.match(/\[[\s\S]*\]/);
  const candidate = arrayMatch?.[0] ?? content;

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (task): task is string => typeof task === 'string' && task.trim().length > 0,
    );
  } catch {
    return [];
  }
}

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed.' }, 405);
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return json({ error: 'AI is not configured. Add OPENROUTER_API_KEY in Vercel.' }, 503);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid request body.' }, 400);
    }

    const goal =
      typeof body === 'object' && body !== null && 'goal' in body && typeof body.goal === 'string'
        ? body.goal.trim()
        : '';

    if (!goal) return json({ error: 'Enter a goal first.' }, 400);
    if (goal.length > MAX_GOAL_LENGTH) {
      return json({ error: 'Keep the goal under 2,000 characters.' }, 400);
    }

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': new URL(request.url).origin,
          'X-Title': 'FocusFlow',
        },
        body: JSON.stringify({
          model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
          messages: [
            { role: 'system', content: DECOMPOSE_PROMPT },
            { role: 'user', content: goal },
          ],
          temperature: 0.6,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        console.error('OpenRouter request failed:', response.status);
        return json({ error: 'AI could not process this goal. Try again shortly.' }, 502);
      }

      const result = (await response.json()) as OpenRouterResponse;
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
  },
};
