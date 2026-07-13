import { useState } from 'react';
import { Sparkles, ArrowRight, Key } from 'lucide-react';
import { useStore } from '../store';
import { decomposeTask } from '../lib/api';

const EXAMPLE_GOALS = [
  'Launch a Shopify store',
  'Plan a wedding',
  'Learn TypeScript',
  'Write a business plan',
  'Build a personal brand on X',
  'Organize a conference',
];

export default function AIDecompose() {
  const {
    isDecomposing,
    setDecomposing,
    setDecomposeResult,
    openRouterKey,
    setOpenRouterKey,
  } = useStore();

  const [goal, setGoal] = useState('');
  const [error, setError] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(!openRouterKey);

  async function handleDecompose() {
    const trimmed = goal.trim();
    if (!trimmed) return;
    if (!openRouterKey) {
      setShowKeyInput(true);
      setError('Please add your OpenRouter API key first.');
      return;
    }

    setDecomposing(true);
    setError('');

    try {
      const results = await decomposeTask(trimmed, openRouterKey);
      setDecomposeResult(results);
      setGoal('');
    } catch (err: any) {
      setError(err.message || 'Failed to decompose. Check your API key.');
    } finally {
      setDecomposing(false);
    }
  }

  function handleExampleClick(example: string) {
    setGoal(example);
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Task Decomposition</h1>
          <p className="page-subtitle">
            Paste a big goal — the AI breaks it into actionable steps.
          </p>
        </div>
      </div>

      {/* API Key Setup */}
      {showKeyInput && (
        <div className="card glow-primary" style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <Key size={20} color="var(--color-primary-light)" />
            <h3>OpenRouter API Key</h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            FocusFlow uses OpenRouter to access AI models for task decomposition. Get a free key at{' '}
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener"
              style={{ color: 'var(--color-primary-light)' }}
            >
              openrouter.ai/keys
            </a>
            .
          </p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <input
              className="input"
              type="password"
              placeholder="sk-or-v1-..."
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
            />
            <button
              className="btn btn-primary"
              onClick={() => {
                if (openRouterKey.trim()) setShowKeyInput(false);
              }}
            >
              Save Key
            </button>
          </div>
        </div>
      )}

      <div className="two-col">
        {/* Input */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="ai-decompose-header">
            <div className="ai-icon">🤖</div>
            <div>
              <h3>What's your goal?</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                Be as specific or vague as you want.
              </p>
            </div>
          </div>

          <textarea
            className="input textarea"
            placeholder='e.g., "Launch a Shopify store selling handmade candles"'
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleDecompose();
              }
            }}
            style={{ marginBottom: '1rem' }}
          />

          {error && (
            <div
              style={{
                padding: '0.75rem',
                background: 'rgba(239,68,68,0.1)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-danger-light)',
                fontSize: '0.85rem',
                marginBottom: '1rem',
              }}
            >
              {error}
            </div>
          )}

          <button
            className="btn btn-primary btn-lg"
            onClick={handleDecompose}
            disabled={isDecomposing || !goal.trim()}
            style={{ width: '100%' }}
          >
            {isDecomposing ? (
              <>
                <div className="ai-loading-dots">
                  <span />
                  <span />
                  <span />
                </div>
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles size={18} />
                Decompose Goal
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Examples */}
          <div style={{ marginTop: '1.5rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Try an example
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {EXAMPLE_GOALS.map((ex) => (
                <button
                  key={ex}
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleExampleClick(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Result preview / info */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>How it works</h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  background: 'rgba(99,102,241,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--color-primary-light)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                1
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>Describe Your Goal</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  Type any goal, big or small. "Launch a SaaS" or "Clean the garage" — the AI handles both.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  background: 'rgba(139,92,246,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: '#a78bfa',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                2
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>AI Breaks It Down</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  The AI analyzes your goal, draws from best practices, and generates 4-8 specific, actionable subtasks.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  background: 'rgba(16,185,129,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--color-success-light)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                3
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>Start Executing</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  Add all tasks to your daily list, drag to reorder, and use the Focus Timer to power through each one.
                </p>
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: '1.5rem',
              padding: '1rem',
              background: 'var(--bg-surface-raised)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              💡 <strong style={{ color: 'var(--text-secondary)' }}>Pro tip:</strong> The more specific your goal, the
              better the breakdown. Instead of "Get fit", try "Get fit for a 5K run in 3 months".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
