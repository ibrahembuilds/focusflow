import { supabase } from './supabase';
import type { Task } from '../store';

export interface Circle {
  id: string;
  name: string;
  emoji: string;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
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
}

function circleFromRow(row: CircleRow): Circle {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    ownerId: row.owner_id,
    inviteCode: row.invite_code,
    createdAt: row.created_at,
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

export async function createCircle(name: string, emoji: string): Promise<Result<Circle>> {
  try {
    const { data, error } = await supabase.rpc('create_circle', {
      circle_name: name,
      circle_emoji: emoji,
    });
    if (error) return { data: null, error: error.message };
    return { data: circleFromRow(data as CircleRow), error: null };
  } catch (cause) {
    return { data: null, error: messageOf(cause) };
  }
}

export async function joinCircleByCode(code: string): Promise<Result<Circle>> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { data: null, error: 'Enter an invite code.' };

  try {
    const { data, error } = await supabase.rpc('join_circle_by_code', { code: trimmed });
    if (error) {
      // P0002 is raised by join_circle_by_code for an unknown code.
      const unknownCode = error.code === 'P0002' || /no circle/i.test(error.message);
      return { data: null, error: unknownCode ? `No circle uses the code ${trimmed}.` : error.message };
    }
    return { data: circleFromRow(data as CircleRow), error: null };
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
