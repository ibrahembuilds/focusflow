import { supabase } from './supabase';

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
}

/** Same rule the `profiles.username` check constraint enforces in Postgres. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
}

function fromRow(row: ProfileRow): Profile {
  return { id: row.id, username: row.username, displayName: row.display_name };
}

function messageOf(cause: unknown) {
  return cause instanceof Error ? cause.message : 'Network request failed';
}

/** Trim and lowercase the way the database will, so the UI checks what it saves. */
export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

/** Returns a human-readable problem, or null when the handle is usable. */
export function describeUsernameProblem(raw: string): string | null {
  const username = normalizeUsername(raw);
  if (username.length < 3) return 'Usernames need at least 3 characters.';
  if (username.length > 20) return 'Usernames can be at most 20 characters.';
  if (!USERNAME_PATTERN.test(username)) {
    return 'Use lowercase letters, numbers, and underscores only.';
  }
  return null;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load profile:', error.message);
      return null;
    }
    return data ? fromRow(data as ProfileRow) : null;
  } catch (cause) {
    console.error('Failed to load profile:', messageOf(cause));
    return null;
  }
}

/**
 * Claim or rename a handle. The row normally already exists (created by the
 * `on_auth_user_created` trigger), but upserting also covers accounts made
 * before that trigger existed.
 */
export async function saveProfile(
  userId: string,
  values: { username: string; displayName?: string | null },
): Promise<{ error: string | null }> {
  const username = normalizeUsername(values.username);
  const problem = describeUsernameProblem(username);
  if (problem) return { error: problem };

  try {
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      username,
      display_name: values.displayName?.trim() || null,
    });

    if (!error) return { error: null };
    // 23505 = unique_violation on profiles.username.
    if (error.code === '23505') return { error: `@${username} is already taken.` };
    return { error: error.message };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
}
