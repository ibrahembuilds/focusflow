// Netlify Edge Function (Deno runtime) — registered in netlify.toml against /api/clarify.
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_GOAL_LENGTH = 2_000;

const CLARIFY_PROMPT = `You are FocusFlow AI, a productivity assistant. A user gave you a goal. Ask a few short clarifying questions that would help you create a better, more personalized action plan for them.

Rules:
- Return a JSON object of the shape {"questions": string[]}.
- Ask 2 to 4 questions, no more.
- Each question must be short (under 15 words) and directly useful for planning: timeline, current experience level, constraints, budget, specific sub-goal, or available resources.
- Do not ask questions unrelated to planning the goal, and do not explain your reasoning.
- Return only the JSON object, no other text.`;

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function parseQuestions(content: string): string[] {
  const objectMatch = content.match(/\{[\s\S]*\}/);
  const candidate = objectMatch?.[0] ?? content;

  try {
    const parsed: unknown = JSON.parse(candidate);
    const raw =
      parsed && typeof parsed === 'object' && 'questions' in parsed && Array.isArray((parsed as any).questions)
        ? (parsed as any).questions
        : Array.isArray(parsed)
          ? parsed
          : [];

    return raw.filter((q: unknown): q is string => typeof q === 'string' && q.trim().length > 0).map((q: string) => q.trim());
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
          { role: 'system', content: CLARIFY_PROMPT },
          { role: 'user', content: goal },
        ],
        max_completion_tokens: 300,
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
