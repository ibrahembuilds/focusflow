// OpenRouter API client for AI task decomposition
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DECOMPOSE_PROMPT = `You are FocusFlow AI, an expert productivity assistant. Your job is to break down a user's goal or project into actionable, bite-sized subtasks.

Rules:
- Output ONLY a JSON array of strings, nothing else.
- Each subtask should be a clear, specific action (start with a verb).
- Break complex goals into 4-8 subtasks.
- Order subtasks logically (first things first).
- Make subtasks small enough to complete in one focused session (25-50 min).
- Vary the depth based on the goal's complexity.
- Use simple, direct language.

Example input: "Launch a Shopify store"
Example output: ["Research top products in your niche", "Register domain and set up Shopify account", "Choose and customize a theme", "Add 10-20 products with descriptions and photos", "Set up payment gateway and shipping", "Create essential pages (About, Contact, Policy)", "Test checkout flow end-to-end", "Launch and announce on social media"]

Always output a valid JSON array. No markdown, no explanation.`;

export async function decomposeTask(
  goal: string,
  apiKey: string
): Promise<string[]> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'FocusFlow',
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: DECOMPOSE_PROMPT },
        { role: 'user', content: goal },
      ],
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content?.trim() || '[]';

  // Extract JSON from possible markdown wrapping
  let json = content;
  const match = content.match(/\[[\s\S]*\]/);
  if (match) json = match[0];

  try {
    const tasks = JSON.parse(json);
    if (!Array.isArray(tasks)) throw new Error('Not an array');
    return tasks.filter((t) => typeof t === 'string' && t.trim().length > 0);
  } catch {
    // Fallback: split by newlines and filter
    return content
      .split('\n')
      .map((l: string) => l.replace(/^[\d.\-•*]+\s*/, '').replace(/["\[\],]/g, '').trim())
      .filter((l: string) => l.length > 3);
  }
}
