import { useState, useEffect, useRef, useCallback } from 'react';
import type { FormEvent } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipForward,
  NotepadText,
  Coffee,
  Focus,
  Clock3,
  Plus,
} from 'lucide-react';
import { useStore, getTodaysTasks } from '../store';

const PRESETS = [
  { label: '25m', minutes: 25 },
  { label: '45m', minutes: 45 },
  { label: '60m', minutes: 60 },
];

export default function Timer() {
  const {
    timerRunning,
    timerPaused,
    timerMinutes,
    breakMinutes,
    activeTaskId,
    tasks,
    addTask,
    setTimerRunning,
    setTimerPaused,
    setTimerMinutes,
    setActiveTaskId,
    incrementTaskSession,
    addSession,
  } = useStore();

  const [timeLeft, setTimeLeft] = useState(timerMinutes * 60);
  const [isBreak, setIsBreak] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(String(timerMinutes));
  const [newTodo, setNewTodo] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const totalSeconds = isBreak ? breakMinutes * 60 : timerMinutes * 60;
  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;

  const todaysTasks = getTodaysTasks(tasks);
  const availableTasks = todaysTasks.filter((task) => !task.completed);
  const activeTask = todaysTasks.find((t) => t.id === activeTaskId);

  const playChime = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = isBreak ? 660 : 880;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.6);
    } catch {
      // Audio not supported
    }
  }, [isBreak]);

  const stopTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setTimerRunning(false);
    setTimerPaused(false);
  }, [setTimerRunning, setTimerPaused]);

  const finishSession = useCallback(() => {
    stopTimer();
    playChime();

    if (!isBreak) {
      // Record completed work session
      addSession({
        id: crypto.randomUUID(),
        taskId: activeTaskId,
        taskText: activeTask?.text || null,
        duration: timerMinutes * 60,
        completed: true,
        timestamp: new Date().toISOString(),
      });
      if (activeTaskId) {
        incrementTaskSession(activeTaskId);
      }
      // Switch to break
      setIsBreak(true);
      setTimeLeft(breakMinutes * 60);
    } else {
      // Break finished
      setIsBreak(false);
      setTimeLeft(timerMinutes * 60);
      setActiveTaskId(null);
    }
  }, [
    stopTimer,
    playChime,
    isBreak,
    activeTaskId,
    activeTask,
    timerMinutes,
    breakMinutes,
    addSession,
    incrementTaskSession,
    setActiveTaskId,
  ]);

  // Tick
  useEffect(() => {
    if (!timerRunning || timerPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          finishSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timerRunning, timerPaused, finishSession]);

  // Sync timeLeft when timerMinutes changes
  useEffect(() => {
    if (!timerRunning && !isBreak) {
      setTimeLeft(timerMinutes * 60);
    }
  }, [timerMinutes, timerRunning, isBreak]);

  useEffect(() => {
    setCustomMinutes(String(timerMinutes));
  }, [timerMinutes]);

  // Sync when becoming break
  useEffect(() => {
    if (isBreak && !timerRunning) {
      setTimeLeft(breakMinutes * 60);
    }
  }, [isBreak, breakMinutes, timerRunning]);

  const formatDisplay = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  const [minutesDisplay, secondsDisplay] = formatDisplay(timeLeft).split(':');
  const timerStatus = isBreak
    ? 'Break'
    : timerPaused
      ? 'Paused'
      : timerRunning
        ? 'Focusing'
        : 'Ready';

  const handleStart = () => {
    if (timerRunning) {
      setTimerPaused(false);
    } else {
      setTimerRunning(true);
      setTimerPaused(false);
    }
  };

  const handlePause = () => {
    setTimerPaused(true);
  };

  const handleStop = () => {
    stopTimer();
    setIsBreak(false);
    setTimeLeft(timerMinutes * 60);
    setActiveTaskId(null);
  };

  const handleSkipBreak = () => {
    stopTimer();
    setIsBreak(false);
    setTimeLeft(timerMinutes * 60);
    setActiveTaskId(null);
  };

  const handleCustomDuration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (timerRunning) return;

    const nextMinutes = Math.max(1, Math.min(240, Number.parseInt(customMinutes, 10) || 1));
    setCustomMinutes(String(nextMinutes));
    setTimerMinutes(nextMinutes);
    if (!isBreak) setTimeLeft(nextMinutes * 60);
  };

  const handleAddTodo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedTodo = newTodo.trim();
    if (!trimmedTodo) return;

    addTask(trimmedTodo, 'medium');
    setNewTodo('');

    if (!timerRunning) {
      const createdTask = useStore.getState().tasks[0];
      if (createdTask) setActiveTaskId(createdTask.id);
    }
  };

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Focus Timer</h1>
          <p className="page-subtitle">
            {isBreak ? 'Take a short breather' : 'Deep work session'}
          </p>
        </div>
        {isBreak && (
          <button className="btn btn-ghost btn-sm" onClick={handleSkipBreak}>
            <SkipForward size={14} />
            Skip Break
          </button>
        )}
      </div>

      <div className="timer-layout">
        <section className={`timer-console${isBreak ? ' break-mode' : ''}`} aria-label="Focus timer">
          <div className="timer-console-header">
            <div className="timer-mode">
              <span className="timer-mode-icon" aria-hidden="true">
                {isBreak ? <Coffee size={17} /> : <Focus size={17} />}
              </span>
              <span>
                <small>Session mode</small>
                <strong>{timerStatus}</strong>
              </span>
            </div>

            <div className="timer-presets" aria-label="Focus duration">
              {PRESETS.map((preset) => (
                <button
                  key={preset.minutes}
                  className={`timer-preset ${timerMinutes === preset.minutes && !isBreak ? 'active' : ''}`}
                  onClick={() => {
                    if (!timerRunning) {
                      setTimerMinutes(preset.minutes);
                      if (!isBreak) setTimeLeft(preset.minutes * 60);
                    }
                  }}
                  disabled={timerRunning}
                  aria-pressed={timerMinutes === preset.minutes}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <form className="custom-duration" onSubmit={handleCustomDuration}>
            <label htmlFor="custom-focus-minutes">Custom focus time</label>
            <div className="custom-duration-controls">
              <input
                id="custom-focus-minutes"
                type="number"
                min={1}
                max={240}
                inputMode="numeric"
                value={customMinutes}
                onChange={(event) => setCustomMinutes(event.target.value)}
                disabled={timerRunning}
                aria-describedby="custom-duration-hint"
              />
              <span id="custom-duration-hint">minutes</span>
              <button className="btn btn-ghost btn-sm" type="submit" disabled={timerRunning}>
                Set
              </button>
            </div>
          </form>

          <div className="timer-display">
            <div className="timer-display-meta">
              <span>{isBreak ? 'Reset and breathe' : 'Time remaining'}</span>
              <Clock3 size={16} aria-hidden="true" />
            </div>

            <div
              className="timer-digits"
              aria-label={`${Number(minutesDisplay)} minutes and ${Number(secondsDisplay)} seconds remaining`}
              aria-live="off"
            >
              <span>{minutesDisplay}</span>
              <span className="timer-separator" aria-hidden="true">:</span>
              <span>{secondsDisplay}</span>
            </div>

            <div
              className="timer-progress"
              role="progressbar"
              aria-label="Session progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progress)}
            >
              <span
                className="timer-progress-value"
                style={{ transform: `scaleX(${Math.max(0, Math.min(100, progress)) / 100})` }}
              />
            </div>
          </div>

          <div className="timer-current-task" aria-live="polite">
            <span>{isBreak ? 'Up next' : 'Current task'}</span>
            <strong>
              {isBreak
                ? 'Your next focus session'
                : activeTask?.text || 'Choose a task or start without one'}
            </strong>
          </div>

          <div className="timer-controls">
            {!timerRunning || timerPaused ? (
              <button className="btn btn-primary btn-lg timer-primary-control" onClick={handleStart}>
                <Play size={19} />
                {timerPaused ? 'Resume session' : isBreak ? 'Start break' : 'Start focus'}
              </button>
            ) : (
              <button className="btn btn-primary btn-lg timer-primary-control" onClick={handlePause}>
                <Pause size={19} />
                Pause session
              </button>
            )}
            {(timerRunning || timerPaused) && (
              <button className="btn btn-ghost btn-lg" onClick={handleStop}>
                <Square size={17} />
                End
              </button>
            )}
          </div>

          {!timerRunning && (
            <div className="break-settings">
              <span>Break length</span>
              <div className="break-options" role="group" aria-label="Break duration">
                {[5, 10, 15].map((minutes) => (
                  <button
                    key={minutes}
                    className={`timer-preset ${breakMinutes === minutes ? 'active' : ''}`}
                    onClick={() => useStore.getState().setBreakMinutes(minutes)}
                    aria-pressed={breakMinutes === minutes}
                  >
                    {minutes}m
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Task Selector */}
        <aside className="card timer-task-panel">
          <div className="panel-heading">
            <div>
              <p className="section-label">Session task</p>
              <h2>{activeTask ? 'Selected task' : 'Choose a task'}</h2>
            </div>
            <NotepadText size={18} aria-hidden="true" />
          </div>

          <form className="quick-todo-form" onSubmit={handleAddTodo}>
            <label className="field-label" htmlFor="quick-todo">Add a to-do</label>
            <div className="quick-todo-row">
              <input
                id="quick-todo"
                className="input"
                type="text"
                value={newTodo}
                onChange={(event) => setNewTodo(event.target.value)}
                placeholder="What needs your attention?"
              />
              <button
                className="btn btn-primary btn-icon"
                type="submit"
                disabled={!newTodo.trim()}
                aria-label="Add to-do"
                title="Add to-do"
              >
                <Plus size={17} />
              </button>
            </div>
          </form>

          {availableTasks.length === 0 ? (
            <div className="empty-state">
              <NotepadText className="empty-state-icon" size={34} aria-hidden="true" />
              <div className="empty-state-title">No open tasks for today</div>
              <div className="empty-state-desc">
                Add your first task above, then start a focus session.
              </div>
            </div>
          ) : (
            <div className="task-list" style={{ maxHeight: '300px' }}>
              {availableTasks.map((task) => (
                  <button
                    key={task.id}
                    className={`task-item ${activeTaskId === task.id ? 'active' : ''}`}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      borderColor:
                        activeTaskId === task.id
                          ? 'var(--color-primary)'
                          : undefined,
                      background:
                        activeTaskId === task.id
                          ? 'var(--bg-soft)'
                          : undefined,
                    }}
                    onClick={() => {
                      if (!timerRunning) {
                        setActiveTaskId(
                          activeTaskId === task.id ? null : task.id
                        );
                      }
                    }}
                    disabled={timerRunning}
                  >
                    <span
                      className="task-text"
                      style={{
                        color:
                          activeTaskId === task.id
                            ? 'var(--color-primary-light)'
                            : undefined,
                      }}
                    >
                      {task.text}
                    </span>
                    <span className="badge badge-primary" style={{ marginLeft: 'auto' }}>
                      {task.sessions} sessions
                    </span>
                  </button>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
