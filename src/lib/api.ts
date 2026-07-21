import type { DecomposedTask } from '../store';

export interface ClarifyingAnswer {
  question: string;
  answer: string;
}

function isDecomposedTask(value: unknown): value is DecomposedTask {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as any).text === 'string' &&
    ((value as any).priority === 'low' || (value as any).priority === 'medium' || (value as any).priority === 'high') &&
    typeof (value as any).estimatedSessions === 'number'
  );
}

export async function fetchClarifyingQuestions(goal: string): Promise<string[]> {
  const response = await fetch('/api/clarify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : 'AI could not come up with questions for this goal.';
    throw new Error(message);
  }

  if (!Array.isArray(data.questions)) {
    throw new Error('The AI response did not include any questions.');
  }

  return data.questions.filter((q: unknown): q is string => typeof q === 'string');
}

export async function decomposeTask(goal: string, answers: ClarifyingAnswer[] = []): Promise<DecomposedTask[]> {
  const response = await fetch('/api/decompose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ goal, answers }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof data.error === 'string' ? data.error : 'AI task breakdown is unavailable.';
    throw new Error(message);
  }

  if (!Array.isArray(data.tasks)) {
    throw new Error('The AI response did not include a task list.');
  }

  return data.tasks.filter(isDecomposedTask);
}
