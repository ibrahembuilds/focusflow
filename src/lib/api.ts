export async function decomposeTask(goal: string): Promise<string[]> {
  const response = await fetch('/api/decompose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : 'AI task breakdown is unavailable.';
    throw new Error(message);
  }

  if (!Array.isArray(data.tasks)) {
    throw new Error('The AI response did not include a task list.');
  }

  return data.tasks.filter((task: unknown): task is string => typeof task === 'string');
}
