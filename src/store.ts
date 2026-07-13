import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ── Types ──
export interface Task {
  id: string;
  text: string;
  completed: boolean;
  sessions: number;
  createdAt: string; // ISO date
  projectId?: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
}

export interface TimerSession {
  id: string;
  taskId: string | null;
  taskText: string | null;
  duration: number; // seconds
  completed: boolean;
  timestamp: string;
}

export interface FocusFlowState {
  // Tasks
  tasks: Task[];
  addTask: (text: string, priority?: Task['priority']) => void;
  addTasks: (texts: string[]) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (fromIndex: number, toIndex: number) => void;
  incrementTaskSession: (id: string) => void;

  // Timer
  timerRunning: boolean;
  timerPaused: boolean;
  timerMinutes: number;
  breakMinutes: number;
  activeTaskId: string | null;
  setTimerRunning: (running: boolean) => void;
  setTimerPaused: (paused: boolean) => void;
  setTimerMinutes: (minutes: number) => void;
  setBreakMinutes: (minutes: number) => void;
  setActiveTaskId: (id: string | null) => void;

  // Sessions history
  sessions: TimerSession[];
  addSession: (session: TimerSession) => void;

  // AI Decompose
  isDecomposing: boolean;
  decomposeResult: string[];
  setDecomposing: (v: boolean) => void;
  setDecomposeResult: (results: string[]) => void;
  clearDecompose: () => void;

  // API key (stored locally, sent on each request)
  openRouterKey: string;
  setOpenRouterKey: (key: string) => void;
}

// Helper
const today = () => new Date().toISOString().split('T')[0];
const uid = () => crypto.randomUUID();

export const useStore = create<FocusFlowState>()(
  persist(
    (set) => ({
      // ── Tasks ──
      tasks: [],

      addTask: (text, priority = 'medium') =>
        set((s) => ({
          tasks: [
            { id: uid(), text, completed: false, sessions: 0, createdAt: today(), priority },
            ...s.tasks,
          ],
        })),

      addTasks: (texts) =>
        set((s) => ({
          tasks: [
            ...texts.map((t) => ({
              id: uid(),
              text: t,
              completed: false,
              sessions: 0,
              createdAt: today(),
              priority: 'medium' as const,
            })),
            ...s.tasks,
          ],
        })),

      toggleTask: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
        })),

      deleteTask: (id) =>
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          activeTaskId: s.activeTaskId === id ? null : s.activeTaskId,
        })),

      reorderTasks: (fromIndex, toIndex) =>
        set((s) => {
          const todaysTasks = s.tasks.filter((t) => t.createdAt === today());
          const others = s.tasks.filter((t) => t.createdAt !== today());
          const [moved] = todaysTasks.splice(fromIndex, 1);
          todaysTasks.splice(toIndex, 0, moved);
          return { tasks: [...todaysTasks, ...others] };
        }),

      incrementTaskSession: (id) =>
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, sessions: t.sessions + 1 } : t
          ),
        })),

      // ── Timer ──
      timerRunning: false,
      timerPaused: false,
      timerMinutes: 25,
      breakMinutes: 5,
      activeTaskId: null,

      setTimerRunning: (running) => set({ timerRunning: running }),
      setTimerPaused: (paused) => set({ timerPaused: paused }),
      setTimerMinutes: (minutes) => set({ timerMinutes: minutes }),
      setBreakMinutes: (minutes) => set({ breakMinutes: minutes }),
      setActiveTaskId: (id) => set({ activeTaskId: id }),

      // ── Sessions ──
      sessions: [],
      addSession: (session) =>
        set((s) => ({ sessions: [session, ...s.sessions] })),

      // ── AI ──
      isDecomposing: false,
      decomposeResult: [],
      setDecomposing: (v) => set({ isDecomposing: v }),
      setDecomposeResult: (results) => set({ decomposeResult: results }),
      clearDecompose: () => set({ decomposeResult: [], isDecomposing: false }),

      // ── API Key ──
      openRouterKey: '',
      setOpenRouterKey: (key) => set({ openRouterKey: key }),
    }),
    {
      name: 'focusflow-storage',
      partialize: (state) => ({
        tasks: state.tasks,
        sessions: state.sessions,
        timerMinutes: state.timerMinutes,
        breakMinutes: state.breakMinutes,
        openRouterKey: state.openRouterKey,
      }),
    }
  )
);

// ── Derived helpers (not stored) ──
export function getTodaysTasks(tasks: Task[]) {
  return tasks.filter((t) => t.createdAt === today());
}

export function getCompletedToday(tasks: Task[]) {
  return tasks.filter((t) => t.completed && t.createdAt === today()).length;
}

export function getTotalSessions(sessions: TimerSession[]) {
  return sessions.filter((s) => s.completed).length;
}

export function getTotalFocusTime(sessions: TimerSession[]) {
  return sessions.filter((s) => s.completed).reduce((acc, s) => acc + s.duration, 0);
}

export function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function getWeeklyData(tasks: Task[], sessions: TimerSession[]) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const data = days.map((name, i) => {
    const date = new Date();
    date.setDate(date.getDate() - date.getDay() + i);
    const ds = date.toISOString().split('T')[0];
    return {
      name,
      tasks: tasks.filter((t) => t.createdAt === ds).length,
      completed: tasks.filter((t) => t.completed && t.createdAt === ds).length,
      sessions: sessions.filter((s) => s.completed && s.timestamp.startsWith(ds)).length,
      minutes: Math.round(
        sessions
          .filter((s) => s.completed && s.timestamp.startsWith(ds))
          .reduce((acc, s) => acc + s.duration, 0) / 60
      ),
    };
  });
  return data;
}
