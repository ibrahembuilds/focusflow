import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Square, SkipForward } from 'lucide-react';
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
    setTimerRunning,
    setTimerPaused,
    setTimerMinutes,
    setActiveTaskId,
    incrementTaskSession,
    addSession,
  } = useStore();

  const [timeLeft, setTimeLeft] = useState(timerMinutes * 60);
  const [isBreak, setIsBreak] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const totalSeconds = isBreak ? breakMinutes * 60 : timerMinutes * 60;
  const progress = ((totalSeconds - timeLeft) / totalSeconds) * 100;
  const circumference = 2 * Math.PI * 130; // r=130

  const todaysTasks = getTodaysTasks(tasks);
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

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Focus Timer</h1>
          <p className="page-subtitle">
            {isBreak ? 'Take a breather ☕' : 'Deep work session'}
          </p>
        </div>
        {isBreak && timerRunning && (
          <button className="btn btn-ghost btn-sm" onClick={handleSkipBreak}>
            <SkipForward size={14} />
            Skip Break
          </button>
        )}
      </div>

      <div className="two-col">
        {/* Timer */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* Presets */}
          <div className="timer-presets">
            {PRESETS.map((p) => (
              <button
                key={p.minutes}
                className={`timer-preset ${timerMinutes === p.minutes && !timerRunning ? 'active' : ''}`}
                onClick={() => {
                  if (!timerRunning) {
                    setTimerMinutes(p.minutes);
                    setTimeLeft(p.minutes * 60);
                  }
                }}
                disabled={timerRunning}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Ring */}
          <div className="timer-ring-container" style={{ margin: '1.5rem 0' }}>
            <svg className="timer-ring" viewBox="0 0 280 280">
              <circle
                className="timer-ring-bg"
                cx="140"
                cy="140"
                r="130"
              />
              <circle
                className={`timer-ring-progress ${isBreak ? 'break' : ''}`}
                cx="140"
                cy="140"
                r="130"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (progress / 100) * circumference}
              />
            </svg>
            <div className="timer-center">
              <div className="timer-time">{formatDisplay(timeLeft)}</div>
              <div className="timer-label-text">
                {isBreak ? '☕ Break Time' : '🎯 Focus Time'}
              </div>
              {activeTask && !isBreak && (
                <div className="timer-task-name">{activeTask.text}</div>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="timer-controls">
            {!timerRunning || timerPaused ? (
              <button className="btn btn-primary btn-lg" onClick={handleStart}>
                <Play size={20} />
                {timerPaused ? 'Resume' : 'Start Focus'}
              </button>
            ) : (
              <button className="btn btn-accent btn-lg" onClick={handlePause}>
                <Pause size={20} />
                Pause
              </button>
            )}
            {(timerRunning || timerPaused) && (
              <button className="btn btn-danger btn-lg" onClick={handleStop}>
                <Square size={18} />
                Stop
              </button>
            )}
          </div>

          {/* Break duration */}
          {!timerRunning && (
            <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Break:</span>
              {[5, 10, 15].map((m) => (
                <button
                  key={m}
                  className={`timer-preset ${breakMinutes === m ? 'active' : ''}`}
                  onClick={() => useStore.getState().setBreakMinutes(m)}
                >
                  {m}m
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Task Selector */}
        <div className="card">
          <h3 style={{ marginBottom: '1rem' }}>
            {activeTask ? 'Currently Working On' : 'Select a Task'}
          </h3>

          {todaysTasks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">📝</div>
              <div className="empty-state-title">No tasks for today</div>
              <div className="empty-state-desc">
                Add tasks in the Tasks page to track your focus sessions.
              </div>
            </div>
          ) : (
            <div className="task-list" style={{ maxHeight: '300px' }}>
              {todaysTasks
                .filter((t) => !t.completed)
                .map((task) => (
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
                          ? 'rgba(99,102,241,0.08)'
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
                      {task.sessions} 🍅
                    </span>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
