import { useEffect, useState } from 'react';
import { Sparkles, Check, Plus } from 'lucide-react';
import { useStore } from '../store';
import type { DecomposedTask } from '../store';

/**
 * The AI Decompose result lives in the store, not on any one page — whoever
 * the user navigates to next (their personal task list, or a circle) gets to
 * decide where the suggestions land. `onAdd` is where that destination-specific
 * logic goes; this component only owns the review/select UI.
 */
export default function AISuggestionsBanner({
  addLabel,
  onAdd,
}: {
  /** e.g. "to Today" or "to this circle" — the banner adds " N " before it. */
  addLabel: string;
  onAdd: (selected: DecomposedTask[]) => void | Promise<void>;
}) {
  const { decomposeResult, clearDecompose } = useStore();
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setSelectedIndices(new Set(decomposeResult.map((_, i) => i)));
  }, [decomposeResult]);

  if (decomposeResult.length === 0) return null;

  function toggleDecomposedSelection(index: number) {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  async function handleAdd() {
    const selected = decomposeResult.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;
    setAdding(true);
    await onAdd(selected);
    setAdding(false);
    clearDecompose();
  }

  return (
    <div
      className="ai-decompose-box"
      style={{ borderColor: 'var(--color-primary)', boxShadow: 'var(--shadow-glow-primary)' }}
    >
      <div className="ai-decompose-header">
        <div className="ai-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <h3 style={{ fontSize: '0.95rem' }}>AI Suggestions Ready</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
            {selectedIndices.size} of {decomposeResult.length} selected
          </p>
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm ai-select-toggle"
          onClick={() =>
            setSelectedIndices(
              selectedIndices.size === decomposeResult.length
                ? new Set()
                : new Set(decomposeResult.map((_, i) => i)),
            )
          }
        >
          {selectedIndices.size === decomposeResult.length ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="ai-result-list">
        {decomposeResult.map((task, i) => (
          <div key={i} className="ai-result-item">
            <button
              type="button"
              className={`task-check ${selectedIndices.has(i) ? 'done' : ''}`}
              onClick={() => toggleDecomposedSelection(i)}
              aria-pressed={selectedIndices.has(i)}
              aria-label={selectedIndices.has(i) ? 'Deselect task' : 'Select task'}
            >
              {selectedIndices.has(i) && <Check size={12} strokeWidth={3} />}
            </button>
            <span className="ai-result-text">{task.text}</span>
            <span
              className={`badge ${
                task.priority === 'high' ? 'badge-danger' : task.priority === 'low' ? 'badge-primary' : 'badge-warning'
              }`}
            >
              {task.priority}
            </span>
            <span className="ai-result-sessions">
              {task.estimatedSessions} {task.estimatedSessions === 1 ? 'session' : 'sessions'}
            </span>
          </div>
        ))}
      </div>
      <div className="ai-add-all" style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="btn btn-primary" onClick={() => void handleAdd()} disabled={selectedIndices.size === 0 || adding}>
          <Plus size={14} />
          {adding ? 'Adding…' : `Add ${selectedIndices.size > 0 ? selectedIndices.size : ''} ${addLabel}`}
        </button>
        <button className="btn btn-ghost" onClick={clearDecompose} disabled={adding}>
          Dismiss
        </button>
      </div>
    </div>
  );
}
