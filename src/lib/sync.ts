import { supabase } from './supabase';
import type { Task, TimerSession } from '../store';

interface TaskRow {
  id: string;
  user_id: string;
  text: string;
  completed: boolean;
  sessions: number;
  created_at: string;
  project_id: string | null;
  due_date: string | null;
  priority: Task['priority'];
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

export async function fetchUserTasks(userId: string): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', userId)
    .order('inserted_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch tasks:', error.message);
    return [];
  }
  return (data as TaskRow[]).map(taskFromRow);
}

export async function fetchUserSessions(userId: string): Promise<TimerSession[]> {
  const { data, error } = await supabase
    .from('timer_sessions')
    .select('*')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false });

  if (error) {
    console.error('Failed to fetch sessions:', error.message);
    return [];
  }
  return (data as SessionRow[]).map(sessionFromRow);
}

export async function upsertTaskRemote(userId: string, task: Task) {
  const { error } = await supabase.from('tasks').upsert({
    id: task.id,
    user_id: userId,
    text: task.text,
    completed: task.completed,
    sessions: task.sessions,
    created_at: task.createdAt,
    project_id: task.projectId ?? null,
    due_date: task.dueDate ?? null,
    priority: task.priority ?? 'medium',
  });
  if (error) console.error('Failed to save task:', error.message);
}

export async function deleteTaskRemote(taskId: string) {
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) console.error('Failed to delete task:', error.message);
}

export async function insertSessionRemote(userId: string, session: TimerSession) {
  const { error } = await supabase.from('timer_sessions').insert({
    id: session.id,
    user_id: userId,
    task_id: session.taskId,
    task_text: session.taskText,
    duration: session.duration,
    completed: session.completed,
    timestamp: session.timestamp,
  });
  if (error) console.error('Failed to save session:', error.message);
}

export async function updateOnboardingRemote(completed: boolean) {
  const { error } = await supabase.auth.updateUser({ data: { hasCompletedOnboarding: completed } });
  if (error) console.error('Failed to save onboarding state:', error.message);
}
