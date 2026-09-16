import { supabase } from './supabase';

export const AVATAR_COLORS = ['forest', 'ocean', 'violet', 'rose', 'amber'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export const AVATAR_EMOJI = [
  '🌱', '🔥', '📚', '🎯', '☕', '🧠', '🚀', '🎧', '🌙', '⚡', '🏃', '🐢',
] as const;

export interface Profile {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarEmoji: string;
  avatarColor: AvatarColor;
  /** An uploaded photo. When set, it's shown instead of the emoji. */
  avatarUrl: string | null;
  /** Whether /u/<username> answers at all. */
  isPublic: boolean;
  showStreak: boolean;
  showFocusTime: boolean;
  showCompleted: boolean;
  createdAt: string;
}

/** What a visitor sees at /u/<username> — only the parts the owner shares. */
export interface PublicProfile {
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarEmoji: string;
  avatarColor: AvatarColor;
  avatarUrl: string | null;
  memberSince: string;
  /** Null when the owner keeps that number to themselves. */
  completedTotal: number | null;
  focusSecondsTotal: number | null;
  activeDates: string[] | null;
}

/** Same rule the `profiles.username` check constraint enforces in Postgres. */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const BIO_MAX_LENGTH = 240;

interface ProfileRow {
  id: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  is_public: boolean | null;
  show_streak: boolean | null;
  show_focus_time: boolean | null;
  show_completed: boolean | null;
  created_at: string;
}

interface PublicProfileRow {
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_emoji: string | null;
  avatar_color: string | null;
  avatar_url: string | null;
  member_since: string;
  completed_total: number | null;
  focus_seconds_total: number | null;
  active_dates: string[] | null;
}

function asAvatarColor(value: string | null | undefined): AvatarColor {
  return AVATAR_COLORS.includes(value as AvatarColor) ? (value as AvatarColor) : 'forest';
}

function fromRow(row: ProfileRow): Profile {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    bio: row.bio,
    avatarEmoji: row.avatar_emoji || '🌱',
    avatarColor: asAvatarColor(row.avatar_color),
    avatarUrl: row.avatar_url || null,
    isPublic: row.is_public ?? true,
    showStreak: row.show_streak ?? true,
    showFocusTime: row.show_focus_time ?? true,
    showCompleted: row.show_completed ?? true,
    createdAt: row.created_at,
  };
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

/** The link someone shares with a friend. */
export function profileUrl(username: string) {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/u/${username}`;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
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

export interface ProfileDraft {
  username: string;
  displayName?: string | null;
  bio?: string | null;
  avatarEmoji?: string;
  avatarColor?: AvatarColor;
  /** An uploaded photo's public URL, or null to fall back to the emoji. */
  avatarUrl?: string | null;
  isPublic?: boolean;
  showStreak?: boolean;
  showFocusTime?: boolean;
  showCompleted?: boolean;
}

/**
 * Claim or update a profile. The row normally already exists (created by the
 * `on_auth_user_created` trigger), but upserting also covers accounts made
 * before that trigger existed.
 */
export async function saveProfile(
  userId: string,
  values: ProfileDraft,
): Promise<{ error: string | null }> {
  const username = normalizeUsername(values.username);
  const problem = describeUsernameProblem(username);
  if (problem) return { error: problem };

  const bio = values.bio?.trim() || null;
  if (bio && bio.length > BIO_MAX_LENGTH) {
    return { error: `Your bio can be at most ${BIO_MAX_LENGTH} characters.` };
  }

  try {
    const { error } = await supabase.from('profiles').upsert({
      id: userId,
      username,
      display_name: values.displayName?.trim() || null,
      bio,
      avatar_emoji: values.avatarEmoji ?? '🌱',
      avatar_color: values.avatarColor ?? 'forest',
      avatar_url: values.avatarUrl ?? null,
      is_public: values.isPublic ?? true,
      show_streak: values.showStreak ?? true,
      show_focus_time: values.showFocusTime ?? true,
      show_completed: values.showCompleted ?? true,
      // Recorded so this person's day is measured where they live, whoever is
      // looking at their streak.
      tz_offset_minutes: new Date().getTimezoneOffset(),
    });

    if (!error) return { error: null };
    // 23505 = unique_violation on profiles.username.
    if (error.code === '23505') return { error: `@${username} is already taken.` };
    return { error: error.message };
  } catch (cause) {
    return { error: messageOf(cause) };
  }
}

/**
 * Read a shared profile. Returns null both for a handle nobody owns and for one
 * whose owner keeps it private — a visitor cannot tell the two apart.
 */
export async function fetchPublicProfile(handle: string): Promise<PublicProfile | null> {
  try {
    const { data, error } = await supabase.rpc('public_profile', {
      handle: normalizeUsername(handle),
    });

    if (error) {
      console.error('Failed to load profile:', error.message);
      return null;
    }
    const row = (data as PublicProfileRow[] | null)?.[0];
    if (!row) return null;

    return {
      username: row.username,
      displayName: row.display_name,
      bio: row.bio,
      avatarEmoji: row.avatar_emoji || '🌱',
      avatarColor: asAvatarColor(row.avatar_color),
      avatarUrl: row.avatar_url || null,
      memberSince: row.member_since,
      completedTotal: row.completed_total,
      focusSecondsTotal: row.focus_seconds_total,
      activeDates: row.active_dates,
    };
  } catch (cause) {
    console.error('Failed to load profile:', messageOf(cause));
    return null;
  }
}

// ── Avatar photos ──
// Stored at avatars/<user_id>/<random>.<ext> in the public `avatars` bucket
// (see supabase/migrations/004_avatars_and_group_privacy.sql). The path
// starting with the uploader's own id is what the storage policy checks, so
// nobody can write into another account's folder.

export const AVATAR_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Returns a human-readable problem, or null when the file is usable. */
export function describeAvatarFileProblem(file: File): string | null {
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    return 'Please choose a JPG, PNG, WEBP, or GIF image.';
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return `That image is too big — please choose one under ${AVATAR_MAX_BYTES / (1024 * 1024)}MB.`;
  }
  return null;
}

export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  const problem = describeAvatarFileProblem(file);
  if (problem) return { url: null, error: problem };

  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  // A random name (not the task/profile id) means an old cached copy of a
  // previous photo, still open in someone else's tab, is never overwritten
  // out from under them — it just stops being linked from the profile.
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;

  try {
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: false, cacheControl: '31536000' });

    if (uploadError) return { url: null, error: uploadError.message };

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  } catch (cause) {
    return { url: null, error: messageOf(cause) };
  }
}
