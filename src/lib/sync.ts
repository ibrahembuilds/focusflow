import { supabase } from './supabase';
import type { Profile, Task, Team, TeamInvite, TeamMember, TeamRole, TimerSession } from '../store';

interface TaskRow {
  id: string;
  user_id: string;
  team_id: string | null;
  text: string;
  completed: boolean;
  sessions: number;
  created_at: string;
  project_id: string | null;
  due_date: string | null;
  priority: Task['priority'];
  notes: string | null;
  subject: string | null;
}

interface SessionRow {
  id: string;
  user_id: string;
  task_id: string | null;
  task_text: string | null;
  duration: number;
  completed: boolean;
  timestamp: string;
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    sessions: row.sessions,
    createdAt: row.created_at,
    projectId: row.project_id ?? undefined,
    dueDate: row.due_date ?? undefined,
    priority: row.priority ?? undefined,
    notes: row.notes ?? undefined,
    subject: row.subject ?? undefined,
    teamId: row.team_id ?? undefined,
    ownerId: row.user_id,
  };
}

function taskToRow(userId: string, task: Task) {
  return {
    id: task.id,
    // A task's row owner never changes to whoever is currently editing it —
    // a teammate toggling a shared task must not reassign it to themselves.
    // Fall back to the acting user only for tasks cached before `ownerId`
    // existed, so they still round-trip correctly.
    user_id: task.ownerId ?? userId,
    team_id: task.teamId ?? null,
    text: task.text,
    completed: task.completed,
    sessions: task.sessions,
    created_at: task.createdAt,
    project_id: task.projectId ?? null,
    due_date: task.dueDate ?? null,
    priority: task.priority ?? 'medium',
    notes: task.notes ?? null,
    subject: task.subject ?? null,
  };
}

function sessionFromRow(row: SessionRow): TimerSession {
  return {
    id: row.id,
    taskId: row.task_id,
    taskText: row.task_text,
    duration: row.duration,
    completed: row.completed,
    timestamp: row.timestamp,
  };
}

function sessionToRow(userId: string, session: TimerSession) {
  return {
    id: session.id,
    user_id: userId,
    task_id: session.taskId,
    task_text: session.taskText,
    duration: session.duration,
    completed: session.completed,
    timestamp: session.timestamp,
  };
}

// ── Reads ──
// Both readers return null when the request fails, so callers can tell
// "this account has no tasks yet" apart from "we couldn't reach the server"
// and avoid wiping good local data on a transient error.

export async function fetchUserTasks(): Promise<Task[] | null> {
  try {
    // No `.eq('user_id', ...)` filter here on purpose: row-level security
    // already returns exactly what this account may see — its own tasks plus
    // every task on a team it belongs to — and a client-side owner filter
    // would silently hide the team ones.
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('inserted_at', { ascending: false });

    if (error) {
      console.error('Failed to fetch tasks:', error.message);
      return null;
    }
    return (data as TaskRow[]).map(taskFromRow);
  } catch (cause) {
    console.error('Failed to fetch tasks:', messageOf(cause));
    return null;
  }
}

export async function fetchUserSessions(userId: string): Promise<TimerSession[] | null> {
  try {
    const { data, error } = await supabase
      .from('timer_sessions')
      .select('*')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false });

    if (error) {
      console.error('Failed to fetch sessions:', error.message);
      return null;
    }
    return (data as SessionRow[]).map(sessionFromRow);
  } catch (cause) {
    console.error('Failed to fetch sessions:', messageOf(cause));
    return null;
  }
}

// ── Durable writes ──
// Every write is recorded in a local outbox before it is attempted and is only
// dropped once Supabase confirms it. A task added while offline — or during a
// dropped request — therefore still reaches the user's account on the next
// flush, instead of silently living in this browser until the next sign-in
// replaces it with server state.

const QUEUE_KEY = 'focusflow-pending-writes';
// A write that keeps failing for a non-transient reason must not block the
// queue forever; give up after this many flush attempts.
const MAX_ATTEMPTS = 8;

type WriteBody =
  | { kind: 'task-upsert'; task: Task }
  | { kind: 'task-delete'; taskId: string }
  | { kind: 'session-upsert'; session: TimerSession };

/** Rows sharing a `key` collapse to the newest one, so intents never replay stale state. */
type NewWrite = WriteBody & { key: string; userId: string };
type PendingWrite = NewWrite & { seq: number; attempts: number };

export interface SyncStatus {
  /** Writes still waiting to reach Supabase. */
  pending: number;
  flushing: boolean;
  /** Message from the most recent failed flush, cleared once one succeeds. */
  error: string | null;
}

type StatusListener = (status: SyncStatus) => void;

const statusListeners = new Set<StatusListener>();
let flushing = false;
let lastError: string | null = null;
let currentUserId: string | null = null;

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Network request failed';
}

function readQueue(): PendingWrite[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingWrite[]) : [];
  } catch {
    return [];
  }
}

// Continue past the highest sequence already on disk so writes restored from a
// previous visit keep distinct ids from the ones made in this one.
let seqCounter = readQueue().reduce((max, write) => Math.max(max, write.seq ?? 0), 0);

function writeQueue(queue: PendingWrite[]) {
  try {
    if (queue.length === 0) localStorage.removeItem(QUEUE_KEY);
    else localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (cause) {
    console.error('Failed to record pending change:', messageOf(cause));
  }
  notifyStatus();
}

function notifyStatus() {
  const status = getSyncStatus();
  statusListeners.forEach((listener) => listener(status));
}

export function getSyncStatus(): SyncStatus {
  return { pending: readQueue().length, flushing, error: lastError };
}

export function subscribeSyncStatus(listener: StatusListener) {
  statusListeners.add(listener);
  listener(getSyncStatus());
  return () => statusListeners.delete(listener);
}

function enqueue(write: NewWrite) {
  // Tasks share one key across upserts and deletes, so the newest intent for a
  // row always supersedes older queued ones.
  const queued: PendingWrite = { ...write, seq: (seqCounter += 1), attempts: 0 };
  writeQueue([...readQueue().filter((w) => w.key !== write.key), queued]);
}

function settle(write: PendingWrite) {
  writeQueue(readQueue().filter((w) => w.seq !== write.seq));
}

function recordAttempt(write: PendingWrite, attempts: number) {
  writeQueue(readQueue().map((w) => (w.seq === write.seq ? { ...w, attempts } : w)));
}

async function runWrite(write: PendingWrite): Promise<string | null> {
  try {
    if (write.kind === 'task-upsert') {
      const { error } = await supabase.from('tasks').upsert(taskToRow(write.userId, write.task));
      return error?.message ?? null;
    }
    if (write.kind === 'task-delete') {
      const { error } = await supabase.from('tasks').delete().eq('id', write.taskId);
      return error?.message ?? null;
    }
    // Upsert rather than insert: a retry after an ambiguous failure must not
    // trip the primary key when the first attempt actually landed.
    const { error } = await supabase
      .from('timer_sessions')
      .upsert(sessionToRow(write.userId, write.session));
    return error?.message ?? null;
  } catch (cause) {
    return messageOf(cause);
  }
}

/**
 * Send everything this browser still owes the server for `userId`.
 * Resolves true when that account's outbox is empty.
 */
export async function flushPendingWrites(userId: string | null): Promise<boolean> {
  if (!userId || flushing) return !readQueue().some((w) => w.userId === userId);

  // Writes belonging to another account stay queued until that user signs back
  // in — row-level security would reject them under this session.
  const own = readQueue().filter((w) => w.userId === userId);
  if (own.length === 0) return true;

  flushing = true;
  notifyStatus();
  try {
    for (const write of own) {
      const error = await runWrite(write);
      if (!error) {
        settle(write);
        continue;
      }

      const attempts = write.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        console.error(`Giving up on pending ${write.kind} after ${attempts} attempts:`, error);
        settle(write);
        continue;
      }

      // Stop at the first failure so later writes can't overtake earlier ones.
      recordAttempt(write, attempts);
      lastError = error;
      return false;
    }
    lastError = null;
    return true;
  } finally {
    flushing = false;
    notifyStatus();
  }
}

/** Local edits that haven't reached Supabase yet, for merging over a fetch. */
export function getPendingTaskWrites(userId: string) {
  const own = readQueue().filter((w) => w.userId === userId);
  return {
    upserts: own.flatMap((w) => (w.kind === 'task-upsert' ? [w.task] : [])),
    deletedIds: own.flatMap((w) => (w.kind === 'task-delete' ? [w.taskId] : [])),
  };
}

export function saveTaskRemote(userId: string, task: Task) {
  enqueue({ kind: 'task-upsert', key: `task:${task.id}`, userId, task });
  return flushPendingWrites(userId);
}

export function deleteTaskRemote(userId: string, taskId: string) {
  enqueue({ kind: 'task-delete', key: `task:${taskId}`, userId, taskId });
  return flushPendingWrites(userId);
}

export function saveSessionRemote(userId: string, session: TimerSession) {
  enqueue({ kind: 'session-upsert', key: `session:${session.id}`, userId, session });
  return flushPendingWrites(userId);
}

export async function updateUserMetadata(data: Record<string, unknown>) {
  try {
    const { error } = await supabase.auth.updateUser({ data });
    if (error) console.error('Failed to save account data:', error.message);
  } catch (cause) {
    console.error('Failed to save account data:', messageOf(cause));
  }
}

/** Tells the retry hooks below which account's outbox to drain. */
export function setSyncUser(userId: string | null) {
  currentUserId = userId;
  if (userId) void flushPendingWrites(userId);
}

if (typeof window !== 'undefined') {
  // Retry as soon as the browser is back online, and once more when the tab
  // regains focus — an offline task then lands without the user doing anything.
  window.addEventListener('online', () => void flushPendingWrites(currentUserId));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushPendingWrites(currentUserId);
  });
}

// ── Profile ──
// Unlike tasks/sessions, profile and team actions go straight to Supabase
// rather than through the offline outbox above: they're low-frequency,
// account-setup-style actions (pick a username, invite a teammate) that
// aren't meaningful to queue for later — a stale invite sent "offline" isn't
// something the UI can act on until it's back online anyway.

interface ProfileRow {
  id: string;
  username: string;
  full_name: string | null;
}

function profileFromRow(row: ProfileRow): Profile {
  return { id: row.id, username: row.username, fullName: row.full_name ?? undefined };
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      if (error) console.error('Failed to fetch profile:', error.message);
      return null;
    }
    return profileFromRow(data as ProfileRow);
  } catch (cause) {
    console.error('Failed to fetch profile:', messageOf(cause));
    return null;
  }
}

/** Returns a user-facing error message, or null on success. */
export async function updateProfileFields(
  userId: string,
  fields: { username?: string; fullName?: string }
): Promise<string | null> {
  const patch: Record<string, string> = {};
  if (fields.username !== undefined) patch.username = fields.username;
  if (fields.fullName !== undefined) patch.full_name = fields.fullName;
  if (Object.keys(patch).length === 0) return null;

  try {
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
    if (!error) return null;
    // Postgres unique_violation
    if (error.code === '23505') return 'That username is already taken.';
    return error.message;
  } catch (cause) {
    return messageOf(cause);
  }
}

// ── Teams ──

interface TeamMembershipRow {
  role: TeamRole;
  teams: { id: string; name: string; created_by: string } | null;
}

export async function fetchMyTeams(userId: string): Promise<Team[] | null> {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('role, teams:team_id (id, name, created_by)')
      .eq('user_id', userId);
    if (error) {
      console.error('Failed to fetch teams:', error.message);
      return null;
    }
    return (data as unknown as TeamMembershipRow[])
      .filter((row) => row.teams)
      .map((row) => ({
        id: row.teams!.id,
        name: row.teams!.name,
        createdBy: row.teams!.created_by,
        role: row.role,
      }));
  } catch (cause) {
    console.error('Failed to fetch teams:', messageOf(cause));
    return null;
  }
}

export async function createTeamRemote(
  userId: string,
  name: string
): Promise<{ team: Team | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('teams')
      .insert({ name, created_by: userId })
      .select('id, name, created_by')
      .single();
    if (error || !data) return { team: null, error: error?.message ?? 'Could not create the team.' };

    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: data.id, user_id: userId, role: 'owner' });
    if (memberError) return { team: null, error: memberError.message };

    return { team: { id: data.id, name: data.name, createdBy: data.created_by, role: 'owner' }, error: null };
  } catch (cause) {
    return { team: null, error: messageOf(cause) };
  }
}

export async function deleteTeamRemote(teamId: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('teams').delete().eq('id', teamId);
    return error?.message ?? null;
  } catch (cause) {
    return messageOf(cause);
  }
}

export async function leaveTeamRemote(teamId: string, userId: string): Promise<string | null> {
  try {
    const { error } = await supabase.from('team_members').delete().eq('team_id', teamId).eq('user_id', userId);
    return error?.message ?? null;
  } catch (cause) {
    return messageOf(cause);
  }
}

export async function fetchTeamMembersRemote(teamId: string): Promise<TeamMember[] | null> {
  try {
    const { data: members, error } = await supabase
      .from('team_members')
      .select('user_id, role')
      .eq('team_id', teamId);
    if (error || !members) {
      if (error) console.error('Failed to fetch team members:', error.message);
      return null;
    }
    if (members.length === 0) return [];

    // team_members and profiles both reference auth.users independently —
    // there's no direct FK PostgREST can embed across, so resolve usernames
    // with a second query instead.
    const userIds = members.map((m) => m.user_id as string);
    const { data: profiles, error: profileError } = await supabase
      .from('profiles')
      .select('id, username, full_name')
      .in('id', userIds);
    if (profileError) {
      console.error('Failed to fetch member profiles:', profileError.message);
      return null;
    }
    const byId = new Map((profiles as ProfileRow[]).map((p) => [p.id, p]));

    return members.map((m) => {
      const profile = byId.get(m.user_id as string);
      return {
        userId: m.user_id as string,
        role: m.role as TeamRole,
        username: profile?.username ?? 'unknown',
        fullName: profile?.full_name ?? undefined,
      };
    });
  } catch (cause) {
    console.error('Failed to fetch team members:', messageOf(cause));
    return null;
  }
}

/** Returns a user-facing error message, or null on success. */
export async function inviteToTeamRemote(
  teamId: string,
  invitedBy: string,
  username: string
): Promise<string | null> {
  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle();
    if (profileError) return profileError.message;
    if (!profile) return `No one on FocusFlow uses the username "${username}".`;
    if (profile.id === invitedBy) return "You're already on this team.";

    const { data: existingMember } = await supabase
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId)
      .eq('user_id', profile.id)
      .maybeSingle();
    if (existingMember) return 'That person is already on this team.';

    const { error } = await supabase
      .from('team_invites')
      .insert({ team_id: teamId, invited_user_id: profile.id, invited_by: invitedBy });
    if (!error) return null;
    if (error.code === '23505') return 'You already invited that person.';
    return error.message;
  } catch (cause) {
    return messageOf(cause);
  }
}

interface TeamInviteRow {
  id: string;
  team_id: string;
  invited_by: string;
  status: TeamInvite['status'];
}

export async function fetchMyInvitesRemote(userId: string): Promise<TeamInvite[] | null> {
  try {
    const { data: invites, error } = await supabase
      .from('team_invites')
      .select('id, team_id, invited_by, status')
      .eq('invited_user_id', userId)
      .eq('status', 'pending');
    if (error) {
      console.error('Failed to fetch invites:', error.message);
      return null;
    }
    const rows = invites as TeamInviteRow[];
    if (rows.length === 0) return [];

    const teamIds = [...new Set(rows.map((i) => i.team_id))];
    const inviterIds = [...new Set(rows.map((i) => i.invited_by))];
    const [{ data: teams }, { data: inviters }] = await Promise.all([
      supabase.from('teams').select('id, name').in('id', teamIds),
      supabase.from('profiles').select('id, username').in('id', inviterIds),
    ]);
    const teamNameById = new Map((teams ?? []).map((t) => [t.id, t.name as string]));
    const inviterNameById = new Map((inviters ?? []).map((p) => [p.id, p.username as string]));

    return rows.map((row) => ({
      id: row.id,
      teamId: row.team_id,
      teamName: teamNameById.get(row.team_id) ?? 'Unknown team',
      invitedBy: row.invited_by,
      invitedByUsername: inviterNameById.get(row.invited_by) ?? 'someone',
      status: row.status,
    }));
  } catch (cause) {
    console.error('Failed to fetch invites:', messageOf(cause));
    return null;
  }
}

/** Returns a user-facing error message, or null on success. */
export async function respondToInviteRemote(
  inviteId: string,
  teamId: string,
  userId: string,
  accept: boolean
): Promise<string | null> {
  try {
    if (!accept) {
      const { error } = await supabase.from('team_invites').update({ status: 'declined' }).eq('id', inviteId);
      return error?.message ?? null;
    }
    const { error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, user_id: userId, role: 'member' });
    if (memberError) return memberError.message;

    const { error: statusError } = await supabase
      .from('team_invites')
      .update({ status: 'accepted' })
      .eq('id', inviteId);
    return statusError?.message ?? null;
  } catch (cause) {
    return messageOf(cause);
  }
}
