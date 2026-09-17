import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  fetchUserTasks,
  fetchUserSessions,
  saveTaskRemote,
  deleteTaskRemote,
  saveSessionRemote,
  updateUserMetadata,
  flushPendingWrites,
  getPendingTaskWrites,
  setSyncUser,
  subscribeSyncStatus,
  fetchProfile,
  updateProfileFields,
  fetchMyTeams,
  createTeamRemote,
  deleteTeamRemote,
  leaveTeamRemote,
  fetchTeamMembersRemote,
  inviteToTeamRemote,
  fetchMyInvitesRemote,
  respondToInviteRemote,
} from './lib/sync';

export interface AuthUser {
  id: string;
  user_metadata?: Record<string, unknown>;
}

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
  /** Freeform notes for this task. */
  notes?: string;
  /** Class/subject tag, e.g. "Math" — mainly useful for student workspaces. */
  subject?: string;
  /** Set when this task lives in a shared team workspace rather than personal. */
  teamId?: string;
  /**
   * The account that created this task — distinct from "whoever is currently
   * signed in", because a teammate can edit a shared task they didn't create.
   * Missing on tasks cached before this field existed; treated as "the
   * current user" at write time in that case.
   */
  ownerId?: string;
}

export interface Profile {
  id: string;
  username: string;
  fullName?: string;
}

export type TeamRole = 'owner' | 'member';

export interface Team {
  id: string;
  name: string;
  createdBy: string;
  role: TeamRole;
}

export interface TeamMember {
  userId: string;
  username: string;
  fullName?: string;
  role: TeamRole;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  teamName: string;
  invitedBy: string;
  invitedByUsername: string;
  status: 'pending' | 'accepted' | 'declined';
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

export interface DecomposedTask {
  text: string;
  priority: NonNullable<Task['priority']>;
  estimatedSessions: number;
}

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

  // Auth-scoped data sync
  userId: string | null;
  isSyncing: boolean;
  /** Changes saved locally that haven't reached the user's account yet. */
  pendingWrites: number;
  syncError: string | null;
  hydrateForUser: (user: AuthUser | null) => Promise<void>;
  retrySync: () => Promise<void>;

  // Tasks
  tasks: Task[];
  addTask: (text: string, priority?: Task['priority'], subject?: string) => void;
  addTasks: (items: { text: string; priority?: Task['priority']; subject?: string }[]) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  reorderTasks: (fromIndex: number, toIndex: number) => void;
  incrementTaskSession: (id: string) => void;
  updateTaskNotes: (id: string, notes: string) => void;

  // Profile
  profile: Profile | null;
  updateUsername: (username: string) => Promise<string | null>;

  // Teams (shared workspaces)
  teams: Team[];
  /** null = the personal workspace; otherwise the id of the active team. */
  activeTeamId: string | null;
  setActiveTeamId: (teamId: string | null) => void;
  teamMembers: TeamMember[];
  isLoadingTeamMembers: boolean;
  pendingInvites: TeamInvite[];
  refreshTeams: () => Promise<void>;
  createTeam: (name: string) => Promise<string | null>;
  deleteTeam: (teamId: string) => Promise<string | null>;
  leaveTeam: (teamId: string) => Promise<string | null>;
  fetchTeamMembers: (teamId: string) => Promise<void>;
  inviteToTeam: (teamId: string, username: string) => Promise<string | null>;
  respondToInvite: (invite: TeamInvite, accept: boolean) => Promise<string | null>;

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
  decomposeResult: DecomposedTask[];
  /** The class/subject typed alongside the goal, applied to every subtask added from it. */
  decomposeSubject: string;
  setDecomposing: (v: boolean) => void;
  setDecomposeResult: (results: DecomposedTask[], subject?: string) => void;
  clearDecompose: () => void;

}

// Helper
const today = () => toLocalDateString(new Date());
const uid = () => crypto.randomUUID();

export const useStore = create<FocusFlowState>()(
  persist(
    (set, get) => ({
      // Appearance
      theme: 'light',
      setTheme: (theme) => {
        set({ theme });
        if (get().userId) void updateUserMetadata({ theme });
      },
      accentColor: 'forest',
      setAccentColor: (accentColor) => {
        set({ accentColor });
        if (get().userId) void updateUserMetadata({ accentColor });
      },
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      hasCompletedOnboarding: false,
      setHasCompletedOnboarding: (hasCompletedOnboarding) => {
        set({ hasCompletedOnboarding });
        if (get().userId) void updateUserMetadata({ hasCompletedOnboarding });
      },

      // ── Auth-scoped data sync ──
      userId: null,
      isSyncing: false,
      pendingWrites: 0,
      syncError: null,

      retrySync: async () => {
        await flushPendingWrites(get().userId);
      },

      hydrateForUser: async (user) => {
        setSyncUser(user?.id ?? null);
        if (!user) {
          set({
            userId: null,
            tasks: [],
            sessions: [],
            profile: null,
            teams: [],
            activeTeamId: null,
            teamMembers: [],
            pendingInvites: [],
          });
          return;
        }
        // Preferences and onboarding state are tied to the account, not the
        // browser, so they follow a user across devices. Only apply a value
        // from the server when it's actually been set — otherwise keep
        // whatever this browser already has (e.g. a brand-new account).
        const metadata = user.user_metadata ?? {};
        const patch: Partial<FocusFlowState> = { userId: user.id, isSyncing: true };
        // Never let one account see what another one left in this browser's
        // local storage.
        const previousUserId = get().userId;
        if (previousUserId && previousUserId !== user.id) {
          patch.tasks = [];
          patch.sessions = [];
          patch.profile = null;
          patch.teams = [];
          patch.activeTeamId = null;
          patch.teamMembers = [];
          patch.pendingInvites = [];
        }
        if (typeof metadata.hasCompletedOnboarding === 'boolean') {
          patch.hasCompletedOnboarding = metadata.hasCompletedOnboarding;
        }
        if (metadata.theme === 'light' || metadata.theme === 'dark') {
          patch.theme = metadata.theme;
        }
        if (typeof metadata.accentColor === 'string') {
          patch.accentColor = metadata.accentColor as AccentColor;
        }
        if (typeof metadata.timerMinutes === 'number') {
          patch.timerMinutes = metadata.timerMinutes;
        }
        if (typeof metadata.breakMinutes === 'number') {
          patch.breakMinutes = metadata.breakMinutes;
        }
        set(patch);

        // Push anything this browser still owes the server before reading it
        // back, so a task created offline isn't erased by the fetch below.
        await flushPendingWrites(user.id);

        const [tasks, sessions, profile] = await Promise.all([
          fetchUserTasks(),
          fetchUserSessions(user.id),
          fetchProfile(user.id),
        ]);
        // Bail if the user switched again while this fetch was in flight.
        if (get().userId !== user.id) return;
        // A failed fetch returns null — keep what we already have rather than
        // blanking the app because the network hiccuped.
        set({
          tasks: tasks ? mergePendingTasks(tasks, user.id) : get().tasks,
          sessions: sessions ?? get().sessions,
          profile: profile ?? get().profile,
          isSyncing: false,
        });

        void get().refreshTeams();
      },

      // ── Tasks ──
      tasks: [],

      addTask: (text, priority = 'medium', subject) => {
        const userId = get().userId;
        const newTask: Task = {
          id: uid(),
          text,
          completed: false,
          sessions: 0,
          createdAt: today(),
          priority,
          subject,
          teamId: get().activeTeamId ?? undefined,
          ownerId: userId ?? undefined,
        };
        set((s) => ({ tasks: [newTask, ...s.tasks] }));
        if (userId) void saveTaskRemote(userId, newTask);
      },

      addTasks: (items) => {
        const userId = get().userId;
        const teamId = get().activeTeamId ?? undefined;
        const newTasks: Task[] = items.map((item) => ({
          id: uid(),
          text: item.text,
          completed: false,
          sessions: 0,
          createdAt: today(),
          priority: item.priority ?? 'medium',
          subject: item.subject,
          teamId,
          ownerId: userId ?? undefined,
        }));
        set((s) => ({ tasks: [...newTasks, ...s.tasks] }));
        if (userId) newTasks.forEach((t) => void saveTaskRemote(userId, t));
      },

      toggleTask: (id) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)),
        }));
        const userId = get().userId;
        const updated = get().tasks.find((t) => t.id === id);
        if (userId && updated) void saveTaskRemote(userId, updated);
      },

      deleteTask: (id) => {
        set((s) => ({
          tasks: s.tasks.filter((t) => t.id !== id),
          activeTaskId: s.activeTaskId === id ? null : s.activeTaskId,
        }));
        const userId = get().userId;
        if (userId) void deleteTaskRemote(userId, id);
      },

      reorderTasks: (fromIndex, toIndex) =>
        set((s) => {
          // Must mirror exactly what TaskList's drag list contains — today,
          // the active workspace, and not yet completed — or fromIndex/
          // toIndex (computed against that list) reorder the wrong task.
          const reorderable = s.tasks.filter(
            (t) =>
              t.createdAt === today() &&
              !t.completed &&
              (s.activeTeamId ? t.teamId === s.activeTeamId : !t.teamId)
          );
          if (fromIndex < 0 || fromIndex >= reorderable.length || toIndex < 0 || toIndex >= reorderable.length) {
            return {};
          }
          const [moved] = reorderable.splice(fromIndex, 1);
          reorderable.splice(toIndex, 0, moved);

          // Walk the full list in its existing order, substituting each
          // reordered task's new neighbor in turn — every other task (a
          // different day, workspace, or already completed) keeps its slot.
          const reorderedIds = new Set(reorderable.map((t) => t.id));
          let cursor = 0;
          const tasks = s.tasks.map((t) => (reorderedIds.has(t.id) ? reorderable[cursor++] : t));
          return { tasks };
        }),

      incrementTaskSession: (id) => {
        set((s) => ({
          tasks: s.tasks.map((t) =>
            t.id === id ? { ...t, sessions: t.sessions + 1 } : t
          ),
        }));
        const userId = get().userId;
        const updated = get().tasks.find((t) => t.id === id);
        if (userId && updated) void saveTaskRemote(userId, updated);
      },

      updateTaskNotes: (id, notes) => {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === id ? { ...t, notes } : t)),
        }));
        const userId = get().userId;
        const updated = get().tasks.find((t) => t.id === id);
        if (userId && updated) void saveTaskRemote(userId, updated);
      },

      // ── Timer ──
      timerRunning: false,
      timerPaused: false,
      timerMinutes: 25,
      breakMinutes: 5,
      activeTaskId: null,

      setTimerRunning: (running) => set({ timerRunning: running }),
      setTimerPaused: (paused) => set({ timerPaused: paused }),
      setTimerMinutes: (minutes) => {
        set({ timerMinutes: minutes });
        if (get().userId) void updateUserMetadata({ timerMinutes: minutes });
      },
      setBreakMinutes: (minutes) => {
        set({ breakMinutes: minutes });
        if (get().userId) void updateUserMetadata({ breakMinutes: minutes });
      },
      setActiveTaskId: (id) => set({ activeTaskId: id }),

      // ── Sessions ──
      sessions: [],
      addSession: (session) => {
        set((s) => ({ sessions: [session, ...s.sessions] }));
        const userId = get().userId;
        if (userId) void saveSessionRemote(userId, session);
      },

      // ── AI ──
      isDecomposing: false,
      decomposeResult: [],
      decomposeSubject: '',
      setDecomposing: (v) => set({ isDecomposing: v }),
      setDecomposeResult: (results, subject = '') => set({ decomposeResult: results, decomposeSubject: subject }),
      clearDecompose: () => set({ decomposeResult: [], decomposeSubject: '', isDecomposing: false }),

      // ── Profile ──
      profile: null,
      updateUsername: async (username) => {
        const userId = get().userId;
        if (!userId) return 'You need to be signed in.';
        const trimmed = username.trim().toLowerCase();
        if (!/^[a-z0-9_]{3,20}$/.test(trimmed)) {
          return 'Usernames are 3-20 characters: lowercase letters, numbers, and underscores.';
        }
        const error = await updateProfileFields(userId, { username: trimmed });
        if (!error) {
          set((s) => ({ profile: s.profile ? { ...s.profile, username: trimmed } : s.profile }));
        }
        return error;
      },

      // ── Teams (shared workspaces) ──
      teams: [],
      activeTeamId: null,
      setActiveTeamId: (teamId) => set({ activeTeamId: teamId, teamMembers: [] }),
      teamMembers: [],
      isLoadingTeamMembers: false,
      pendingInvites: [],

      refreshTeams: async () => {
        const userId = get().userId;
        if (!userId) return;
        const [teams, invites] = await Promise.all([fetchMyTeams(userId), fetchMyInvitesRemote(userId)]);
        if (get().userId !== userId) return;
        set({
          teams: teams ?? get().teams,
          pendingInvites: invites ?? get().pendingInvites,
          // A team the user no longer belongs to (left, removed, deleted)
          // shouldn't stay selected as the active workspace.
          activeTeamId:
            teams && get().activeTeamId && !teams.some((t) => t.id === get().activeTeamId)
              ? null
              : get().activeTeamId,
        });
      },

      createTeam: async (name) => {
        const userId = get().userId;
        if (!userId) return 'You need to be signed in.';
        const trimmed = name.trim();
        if (!trimmed) return 'Give the team a name.';
        const { team, error } = await createTeamRemote(userId, trimmed);
        if (team) {
          set((s) => ({ teams: [...s.teams, team], activeTeamId: team.id, teamMembers: [] }));
        }
        return error;
      },

      deleteTeam: async (teamId) => {
        const error = await deleteTeamRemote(teamId);
        if (!error) {
          set((s) => ({
            teams: s.teams.filter((t) => t.id !== teamId),
            activeTeamId: s.activeTeamId === teamId ? null : s.activeTeamId,
          }));
        }
        return error;
      },

      leaveTeam: async (teamId) => {
        const userId = get().userId;
        if (!userId) return 'You need to be signed in.';
        const error = await leaveTeamRemote(teamId, userId);
        if (!error) {
          set((s) => ({
            teams: s.teams.filter((t) => t.id !== teamId),
            activeTeamId: s.activeTeamId === teamId ? null : s.activeTeamId,
          }));
        }
        return error;
      },

      fetchTeamMembers: async (teamId) => {
        set({ isLoadingTeamMembers: true });
        const members = await fetchTeamMembersRemote(teamId);
        // Bail if the user switched teams while this fetch was in flight.
        if (get().activeTeamId !== teamId) return;
        set({ teamMembers: members ?? [], isLoadingTeamMembers: false });
      },

      inviteToTeam: async (teamId, username) => {
        const userId = get().userId;
        if (!userId) return 'You need to be signed in.';
        const trimmed = username.trim().toLowerCase().replace(/^@/, '');
        if (!trimmed) return 'Enter a username to invite.';
        return inviteToTeamRemote(teamId, userId, trimmed);
      },

      respondToInvite: async (invite, accept) => {
        const userId = get().userId;
        if (!userId) return 'You need to be signed in.';
        const error = await respondToInviteRemote(invite.id, invite.teamId, userId, accept);
        if (!error) {
          set((s) => ({ pendingInvites: s.pendingInvites.filter((i) => i.id !== invite.id) }));
          if (accept) void get().refreshTeams();
        }
        return error;
      },

    }),
    {
      name: 'focusflow-storage',
      partialize: (state) => ({
        // Remembering who the cached tasks belong to lets the next sign-in
        // tell "my data" from "the previous account's data".
        userId: state.userId,
        tasks: state.tasks,
        sessions: state.sessions,
        timerMinutes: state.timerMinutes,
        breakMinutes: state.breakMinutes,
        theme: state.theme,
        accentColor: state.accentColor,
        sidebarCollapsed: state.sidebarCollapsed,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        // Remember which workspace was active, but not the teams/members/
        // invites lists themselves — those always come fresh from the
        // server so a removal or rename elsewhere is never stale here.
        activeTeamId: state.activeTeamId,
      }),
    }
  )
);

// Keep the store's view of the outbox in step with the sync layer so the UI can
// tell the user whether their tasks have actually reached their account.
subscribeSyncStatus(({ pending, error }) => {
  useStore.setState({ pendingWrites: pending, syncError: error });
});

/**
 * Lay local edits that haven't been confirmed yet over the server's copy, so a
 * task added offline stays visible instead of vanishing on the next fetch.
 */
function mergePendingTasks(serverTasks: Task[], userId: string): Task[] {
  const { upserts, deletedIds } = getPendingTaskWrites(userId);
  if (upserts.length === 0 && deletedIds.length === 0) return serverTasks;

  const pendingById = new Map(upserts.map((task) => [task.id, task]));
  const merged = serverTasks
    .filter((task) => !deletedIds.includes(task.id))
    .map((task) => pendingById.get(task.id) ?? task);

  const onServer = new Set(merged.map((task) => task.id));
  const notYetSaved = upserts.filter((task) => !onServer.has(task.id));
  return [...notYetSaved, ...merged];
}

// ── Derived helpers (not stored) ──

/** Personal tasks (no team) when `activeTeamId` is null, otherwise that team's tasks only. */
export function getTasksForWorkspace(tasks: Task[], activeTeamId: string | null) {
  return tasks.filter((t) => (activeTeamId ? t.teamId === activeTeamId : !t.teamId));
}

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
