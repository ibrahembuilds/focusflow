import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Clock3, ListTodo, X } from 'lucide-react';
import { useStore } from '../store';

const SESSION_OPTIONS = [15, 25, 45] as const;

const steps = [
  {
    eyebrow: 'Welcome to FocusFlow',
    title: 'A calmer way to finish what matters.',
    description: 'Plan one clear task, protect time for it, and build a steady rhythm without extra clutter.',
  },
  {
    eyebrow: 'Start small',
    title: 'What would you like to finish first?',
    description: 'Add one task now, or leave this blank and create it later from your dashboard.',
  },
  {
    eyebrow: 'Choose your rhythm',
    title: 'How long do you want to focus?',
    description: 'Pick a starting duration. You can change it at any time in the timer or settings.',
  },
];

export default function Onboarding() {
  const {
    hasCompletedOnboarding,
    setHasCompletedOnboarding,
    addTask,
    setActiveTaskId,
    timerMinutes,
    setTimerMinutes,
  } = useStore();
  const [step, setStep] = useState(0);
  const [firstTask, setFirstTask] = useState('');
  const [duration, setDuration] = useState(timerMinutes);

  useEffect(() => {
    if (hasCompletedOnboarding) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHasCompletedOnboarding(true);
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hasCompletedOnboarding, setHasCompletedOnboarding]);

  if (hasCompletedOnboarding) return null;

  const currentStep = steps[step];

  function finishOnboarding() {
    const taskText = firstTask.trim();
    if (taskText) {
      addTask(taskText);
      const newTask = useStore.getState().tasks[0];
      if (newTask) setActiveTaskId(newTask.id);
    }
    setTimerMinutes(duration);
    setHasCompletedOnboarding(true);
  }

  function handleNext() {
    if (step === steps.length - 1) {
      finishOnboarding();
      return;
    }
    setStep((current) => current + 1);
  }

  return (
    <div className="onboarding-overlay">
      <section
        className="onboarding-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        aria-describedby="onboarding-description"
      >
        <button
          type="button"
          className="onboarding-close"
          onClick={() => setHasCompletedOnboarding(true)}
          aria-label="Skip welcome guide"
        >
          <X size={18} />
        </button>

        <div className="onboarding-visual" aria-hidden="true">
          <div className="onboarding-brand">
            <img src="/brand/focusflow-logo.png" alt="" />
            <span>FocusFlow</span>
          </div>
          <img
            src="/brand/onboarding-focus.jpg"
            alt=""
            className="onboarding-illustration"
          />
          <p>One task. One timer. A clearer day.</p>
        </div>

        <div className="onboarding-content">
          <div className="onboarding-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((item, index) => (
              <span
                key={item.eyebrow}
                className={index <= step ? 'active' : ''}
                aria-hidden="true"
              />
            ))}
          </div>

          <div className="onboarding-copy" key={step}>
            <span className="onboarding-eyebrow">{currentStep.eyebrow}</span>
            <h1 id="onboarding-title">{currentStep.title}</h1>
            <p id="onboarding-description">{currentStep.description}</p>

            {step === 0 && (
              <div className="onboarding-feature-list">
                <div><ListTodo size={18} /><span><strong>Plan simply</strong><small>Keep today’s work clear and visible.</small></span></div>
                <div><Clock3 size={18} /><span><strong>Focus your way</strong><small>Use a duration that works for you.</small></span></div>
              </div>
            )}

            {step === 1 && (
              <div className="onboarding-field">
                <label htmlFor="onboarding-first-task">My first task</label>
                <input
                  id="onboarding-first-task"
                  className="input"
                  type="text"
                  value={firstTask}
                  maxLength={140}
                  onChange={(event) => setFirstTask(event.target.value)}
                  placeholder="Example: Finish the project outline"
                  autoFocus
                />
                <small>{firstTask.length}/140</small>
              </div>
            )}

            {step === 2 && (
              <div className="onboarding-duration-options" role="radiogroup" aria-label="Focus duration">
                {SESSION_OPTIONS.map((minutes) => (
                  <button
                    key={minutes}
                    type="button"
                    className={duration === minutes ? 'active' : ''}
                    onClick={() => setDuration(minutes)}
                    role="radio"
                    aria-checked={duration === minutes}
                  >
                    {duration === minutes && <Check size={16} />}
                    <strong>{minutes}</strong>
                    <span>minutes</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="onboarding-actions">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setStep((current) => current - 1)}
              disabled={step === 0}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={handleNext}>
              {step === steps.length - 1 ? 'Start focusing' : 'Continue'}
              {step === steps.length - 1 ? <Check size={16} /> : <ArrowRight size={16} />}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
