import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, ArrowRight, ArrowLeft, Bot, Lightbulb, MessageCircleQuestion } from 'lucide-react';
import { useStore } from '../store';
import { fetchClarifyingQuestions, decomposeTask } from '../lib/api';
import type { ClarifyingAnswer } from '../lib/api';

type Step = 'goal' | 'questions';

export default function AIDecompose() {
  const { isDecomposing, setDecomposing, setDecomposeResult } = useStore();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState('');
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  function collectAnswers(): ClarifyingAnswer[] {
    return questions
      .map((question, i) => ({ question, answer: (answers[i] ?? '').trim() }))
      .filter((a) => a.answer.length > 0);
  }

  async function handleGenerateRoadmap(answersForGoal: ClarifyingAnswer[]) {
    setDecomposing(true);
    setError('');

    try {
      const results = await decomposeTask(goal, answersForGoal);
      if (results.length === 0) {
        throw new Error('AI returned an unexpected response. Try wording the goal differently.');
      }
      setDecomposeResult(results);
      setGoal('');
      setQuestions([]);
      setAnswers({});
      setStep('goal');
      navigate('/app/tasks');
    } catch (err: any) {
      setError(err.message || 'AI task breakdown is unavailable.');
    } finally {
      setDecomposing(false);
    }
  }

  async function handleAskQuestions() {
    const trimmed = goal.trim();
    if (!trimmed) return;
    setLoadingQuestions(true);
    setError('');

    try {
      const result = await fetchClarifyingQuestions(trimmed);
      if (result.length === 0) throw new Error('AI could not come up with questions for this goal.');
      setQuestions(result);
      setAnswers({});
      setStep('questions');
    } catch (err: any) {
      setError(err.message || 'AI could not come up with questions for this goal.');
    } finally {
      setLoadingQuestions(false);
    }
  }

  function handleSkipQuestions() {
    const trimmed = goal.trim();
    if (!trimmed) return;
    void handleGenerateRoadmap([]);
  }

  function handleBackToGoal() {
    setStep('goal');
    setQuestions([]);
    setAnswers({});
    setError('');
  }

  const busy = isDecomposing || loadingQuestions;

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">AI Task Decomposition</h1>
          <p className="page-subtitle">
            {step === 'goal'
              ? 'Paste a big goal. AI asks a few questions, then turns it into a tailored roadmap.'
              : 'Answer what you can — skip anything you\'re not sure about.'}
          </p>
        </div>
      </div>

      <div className="two-col">
        {/* Input */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          {step === 'goal' ? (
            <>
              <div className="ai-decompose-header">
                <div className="ai-icon"><Bot size={18} /></div>
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
                    handleAskQuestions();
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
                onClick={handleAskQuestions}
                disabled={busy || !goal.trim()}
                style={{ width: '100%' }}
              >
                {loadingQuestions ? (
                  <>
                    <div className="ai-loading-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    Thinking of questions...
                  </>
                ) : (
                  <>
                    <MessageCircleQuestion size={18} />
                    Continue
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm ai-skip-link"
                onClick={handleSkipQuestions}
                disabled={busy || !goal.trim()}
              >
                Skip questions, generate roadmap now
              </button>
            </>
          ) : (
            <>
              <div className="ai-decompose-header">
                <div className="ai-icon"><MessageCircleQuestion size={18} /></div>
                <div>
                  <h3>A few quick questions</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                    For: <strong style={{ color: 'var(--text-secondary)' }}>{goal}</strong>
                  </p>
                </div>
              </div>

              <div className="ai-questions-list">
                {questions.map((question, i) => (
                  <div key={i} className="ai-question-field">
                    <label htmlFor={`ai-answer-${i}`}>{question}</label>
                    <input
                      id={`ai-answer-${i}`}
                      className="input"
                      type="text"
                      value={answers[i] ?? ''}
                      onChange={(e) => setAnswers((prev) => ({ ...prev, [i]: e.target.value }))}
                      placeholder="Your answer (optional)"
                    />
                  </div>
                ))}
              </div>

              {error && (
                <div
                  style={{
                    padding: '0.75rem',
                    background: 'rgba(239,68,68,0.1)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-danger-light)',
                    fontSize: '0.85rem',
                    margin: '1rem 0',
                  }}
                >
                  {error}
                </div>
              )}

              <div className="ai-questions-actions">
                <button type="button" className="btn btn-ghost" onClick={handleBackToGoal} disabled={busy}>
                  <ArrowLeft size={16} />
                  Back
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => handleGenerateRoadmap(collectAnswers())}
                  disabled={busy}
                  style={{ flex: 1 }}
                >
                  {isDecomposing ? (
                    <>
                      <div className="ai-loading-dots">
                        <span />
                        <span />
                        <span />
                      </div>
                      Building roadmap...
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      Generate Roadmap
                    </>
                  )}
                </button>
              </div>
            </>
          )}
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
                  background: 'var(--bg-soft)',
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
                  Type any goal, big or small. AI can structure both projects and everyday tasks.
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div
                style={{
                  width: '2rem',
                  height: '2rem',
                  borderRadius: '50%',
                  background: 'var(--bg-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  color: 'var(--color-primary-light)',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                }}
              >
                2
              </div>
              <div>
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>AI Asks a Few Questions</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  Quick, optional questions about timeline, experience, or constraints — so the plan actually fits you.
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
                <h4 style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>Get Your Roadmap</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>
                  Review the suggested tasks, pick which ones to keep, and start executing with the Focus Timer.
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
              <Lightbulb size={15} style={{ verticalAlign: 'text-bottom', marginRight: '0.35rem' }} />
              <strong style={{ color: 'var(--text-secondary)' }}>Pro tip:</strong> The more specific your goal, the
              better the breakdown. Instead of "Get fit", try "Get fit for a 5K run in 3 months".
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
