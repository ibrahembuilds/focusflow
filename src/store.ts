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

export type AccentColor = 'forest' | 'ocean' | 'violet' | 'rose' | 'amber';

export interface FocusFlowState {
  // Appearance
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;

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

}

// Helper
const today = () => toLocalDateString(new Date());
const uid = () => crypto.randomUUID();

export const useStore = create<FocusFlowState>()(
  persist(
    (set) => ({
      // Appearance
      theme: 'light',
      setTheme: (theme) => set({ theme }),
      accentColor: 'forest',
      setAccentColor: (accentColor) => set({ accentColor }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      hasCompletedOnboarding: false,
      setHasCompletedOnboarding: (hasCompletedOnboarding) => set({ hasCompletedOnboarding }),

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

    }),
    {
      name: 'focusflow-storage',
      partialize: (state) => ({
        tasks: state.tasks,
        sessions: state.sessions,
        timerMinutes: state.timerMinutes,
        breakMinutes: state.breakMinutes,
        theme: state.theme,
        accentColor: state.accentColor,
        sidebarCollapsed: state.sidebarCollapsed,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
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
    const ds = toLocalDateString(date);
    return {
      name,
      tasks: tasks.filter((t) => t.createdAt === ds).length,
      completed: tasks.filter((t) => t.completed && t.createdAt === ds).length,
      sessions: sessions.filter(
        (s) => s.completed && toLocalDateString(new Date(s.timestamp)) === ds,
      ).length,
      minutes: Math.round(
        sessions
          .filter(
            (s) => s.completed && toLocalDateString(new Date(s.timestamp)) === ds,
          )
          .reduce((acc, s) => acc + s.duration, 0) / 60
      ),
    };
  });
  return data;
}

function getActivityDates(tasks: Task[], sessions: TimerSession[]) {
  const dates = new Set<string>();

  tasks.forEach((task) => {
    if (task.completed) dates.add(task.createdAt);
  });

  sessions.forEach((session) => {
    if (session.completed) dates.add(toLocalDateString(new Date(session.timestamp)));
  });

  return dates;
}

function toLocalDateString(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getCurrentStreak(tasks: Task[], sessions: TimerSession[]) {
  const activityDates = getActivityDates(tasks, sessions);
  const cursor = new Date();

  if (!activityDates.has(toLocalDateString(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (activityDates.has(toLocalDateString(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function getLongestStreak(tasks: Task[], sessions: TimerSession[]) {
  const dates = [...getActivityDates(tasks, sessions)].sort();
  if (dates.length === 0) return 0;

  let longest = 1;
  let current = 1;

  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]}T00:00:00`);
    const next = new Date(`${dates[index]}T00:00:00`);
    const difference = Math.round((next.getTime() - previous.getTime()) / 86_400_000);

    if (difference === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (difference > 1) {
      current = 1;
    }
  }

  return longest;
}

export function getRecentActivity(tasks: Task[], sessions: TimerSession[], days = 7) {
  const activityDates = getActivityDates(tasks, sessions);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (days - index - 1));
    const dateString = toLocalDateString(date);

    return {
      date: dateString,
      label: date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1),
      active: activityDates.has(dateString),
      isToday: index === days - 1,
    };
  });
}
