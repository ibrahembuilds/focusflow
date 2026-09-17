import { supabase } from './supabase';
import type { Task } from '../store';

export interface Circle {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  /** false (the default): anyone with the code joins instantly. true: the
   *  owner approves each request before it becomes membership. */
  requireApproval: boolean;
}

/** A task that lives in a circle: same shape as a personal task, plus who owns it. */
export interface CircleTask extends Task {
  circleId: string;
  authorId: string;
  completedBy: string | null;
}

export interface MemberActivity {
  userId: string;
  username: string | null;
  displayName: string | null;
  role: string;
  avatarEmoji: string;
  avatarColor: string;
  avatarUrl: string | null;
  completedToday: number;
  sessionsToday: number;
  focusSecondsToday: number;
  /** ISO dates (YYYY-MM-DD) this member finished a task or a focus session. */
  activeDates: string[];
}

interface CircleRow {
  id: string;
  name: string;
  emoji: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
  require_approval: boolean;
}

interface CircleTaskRow {
  id: string;
  user_id: string;
  circle_id: string;
  text: string;
  completed: boolean;
  sessions: number;
  created_at: string;
  due_date: string | null;
  priority: Task['priority'];
  completed_by: string | null;
}

interface ActivityRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  role: string;
  completed_today: number;
  sessions_today: number;
  focus_seconds_today: number;
  active_dates: string[] | null;
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
}

function circleFromRow(row: CircleRow): Circle {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    ownerId: row.owner_id,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
    requireApproval: row.require_approval ?? false,
  };
}

function taskFromRow(row: CircleTaskRow): CircleTask {
  return {
    id: row.id,
    text: row.text,
    completed: row.completed,
    sessions: row.sessions,
    createdAt: row.created_at,
    dueDate: row.due_date ?? undefined,
    priority: row.priority ?? undefined,
    circleId: row.circle_id,
    authorId: row.user_id,
    completedBy: row.completed_by,
  };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Network request failed';
}

/** Every call returns `{ data, error }` so the UI can always say what went wrong. */
export interface Result<T> {
  data: T | null;
  error: string | null;
}

export async function fetchMyCircles(): Promise<Result<Circle[]>> {
  try {
    const { data, error } = await supabase
      .from('circles')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data: (data as CircleRow[]).map(circleFromRow), error: null };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

export async function fetchCircle(circleId: string): Promise<Result<Circle>> {
  try {
    const { data, error } = await supabase
      .from('circles')
      .select('*')
      .eq('id', circleId)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    if (!data) return { data: null, error: 'That circle is gone, or you are not a member.' };
    return { data: circleFromRow(data as CircleRow), error: null };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

export async function createCircle(
  name: string,
  emoji: string,
  requireApproval = false,
): Promise<Result<Circle>> {
  try {
    const { data, error } = await supabase.rpc('create_circle', {
      circle_name: name,
      circle_emoji: emoji,
    });
    if (error) return { data: null, error: error.message };
    const circle = circleFromRow(data as CircleRow);
    if (!requireApproval) return { data: circle, error: null };

    // A second call rather than a third create_circle parameter: the RLS
    // policy that lets an owner update their own circle already covers this,
    // so there's no need for a bespoke code path just to set one flag.
    const { error: privacyError } = await supabase
      .from('circles')
      .update({ require_approval: true })
      .eq('id', circle.id);
    if (privacyError) return { data: null, error: privacyError.message };
    return { data: { ...circle, requireApproval: true }, error: null };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

/** Flip whether new members need the owner's approval, any time after creation. */
export async function setCircleRequireApproval(
  circleId: string,
  requireApproval: boolean,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('circles')
      .update({ require_approval: requireApproval })
      .eq('id', circleId);
    return { error: error?.message ?? null };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
}

export interface JoinAttempt {
  /** 'joined': you're in. 'pending': the owner needs to approve you first.
   *  'already_member': you were in before you asked. */
  status: 'joined' | 'pending' | 'already_member';
  circle: Circle;
}

interface JoinResultRow {
  status: string;
  circle_id: string;
  circle_name: string;
  circle_emoji: string;
  invite_code: string;
  owner_id: string;
  created_at: string;
  require_approval: boolean;
}

/**
 * Attempts to join with an invite code. For an open circle (the default) this
 * lands you in as a member immediately. For one the owner has set to
 * ask-to-join, it files a request instead — see `status` on the result.
 */
export async function joinCircleByCode(code: string): Promise<Result<JoinAttempt>> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { data: null, error: 'Enter an invite code.' };

  try {
    const { data, error } = await supabase.rpc('join_circle_by_code', { code: trimmed });
    if (error) {
      // P0002 is raised by join_circle_by_code for an unknown code.
      const unknownCode = error.code === 'P0002' || /no circle/i.test(error.message);
      return { data: null, error: unknownCode ? `No circle uses the code ${trimmed}.` : error.message };
    }
    // A set-returning function always comes back as an array, even for one row.
    const row = (data as JoinResultRow[] | null)?.[0];
    if (!row) return { data: null, error: `No circle uses the code ${trimmed}.` };

    return {
      data: {
        status: row.status as JoinAttempt['status'],
        circle: circleFromRow({
          id: row.circle_id,
          name: row.circle_name,
          emoji: row.circle_emoji,
          owner_id: row.owner_id,
          invite_code: row.invite_code,
          created_at: row.created_at,
          require_approval: row.require_approval,
        }),
      },
      error: null,
    };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

export async function leaveCircle(circleId: string, userId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase
      .from('circle_members')
      .delete()
      .eq('circle_id', circleId)
      .eq('user_id', userId);
    return { error: error?.message ?? null };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
}

export async function deleteCircle(circleId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('circles').delete().eq('id', circleId);
    return { error: error?.message ?? null };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
}

export async function fetchCircleTasks(circleId: string): Promise<Result<CircleTask[]>> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('circle_id', circleId)
      .order('inserted_at', { ascending: false });

    if (error) return { data: null, error: error.message };
    return { data: (data as CircleTaskRow[]).map(taskFromRow), error: null };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

export async function addCircleTask(
  circleId: string,
  userId: string,
  text: string,
  priority: NonNullable<Task['priority']>,
  createdAt: string,
): Promise<Result<CircleTask>> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        user_id: userId,
        circle_id: circleId,
        text,
        priority,
        completed: false,
        sessions: 0,
        created_at: createdAt,
      })
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: taskFromRow(data as CircleTaskRow), error: null };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

/**
 * Toggling only sends `completed` — the `tasks_stamp_completion` trigger fills
 * in who ticked it, so a shared task can never be credited to the wrong streak.
 */
export async function setCircleTaskCompleted(
  taskId: string,
  completed: boolean,
): Promise<Result<CircleTask>> {
  try {
    const { data, error } = await supabase
      .from('tasks')
      .update({ completed })
      .eq('id', taskId)
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: taskFromRow(data as CircleTaskRow), error: null };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

export async function deleteCircleTask(taskId: string): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
    return { error: error?.message ?? null };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
}

/**
 * Per-member activity for the streak board. The function returns dates and
 * counts only — never the text of anyone's tasks.
 */
export async function fetchCircleActivity(
  circleId: string,
  clientToday: string,
  timezoneOffsetMinutes: number,
): Promise<Result<MemberActivity[]>> {
  try {
    const { data, error } = await supabase.rpc('circle_activity', {
      target_circle: circleId,
      client_today: clientToday,
      client_tz_offset_minutes: timezoneOffsetMinutes,
    });

    if (error) return { data: null, error: error.message };
    const rows = (data as ActivityRow[]) ?? [];
    return {
      data: rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        role: row.role,
        avatarEmoji: row.avatar_emoji || '🌱',
        avatarColor: row.avatar_color || 'forest',
        avatarUrl: row.avatar_url || null,
        completedToday: row.completed_today,
        sessionsToday: row.sessions_today,
        focusSecondsToday: row.focus_seconds_today,
        activeDates: row.active_dates ?? [],
      })),
      error: null,
    };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

// ── Join requests: the owner's inbox for an ask-to-join circle ──

export interface JoinRequest {
  userId: string;
  username: string | null;
  displayName: string | null;
  avatarEmoji: string;
  avatarColor: string;
  avatarUrl: string | null;
  requestedAt: string;
}

interface JoinRequestRow {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  requested_at: string;
}

/** Owner-only — the database refuses this call for anyone else. */
export async function listJoinRequests(circleId: string): Promise<Result<JoinRequest[]>> {
  try {
    const { data, error } = await supabase.rpc('list_join_requests', { target_circle: circleId });
    if (error) return { data: null, error: error.message };

    const rows = (data as JoinRequestRow[]) ?? [];
    return {
      data: rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        displayName: row.display_name,
        avatarEmoji: row.avatar_emoji || '🌱',
        avatarColor: row.avatar_color || 'forest',
        avatarUrl: row.avatar_url || null,
        requestedAt: row.requested_at,
      })),
      error: null,
    };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

/** Owner-only. Accepting adds the member; declining just clears the request. */
export async function respondToJoinRequest(
  circleId: string,
  requesterId: string,
  accept: boolean,
): Promise<{ error: string | null }> {
  try {
    const { error } = await supabase.rpc('respond_to_join_request', {
      target_circle: circleId,
      requester: requesterId,
      accept,
    });
    return { error: error?.message ?? null };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
}
