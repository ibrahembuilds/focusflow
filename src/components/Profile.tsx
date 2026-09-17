import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Check, Copy, Eye, EyeOff, Link2, Loader2, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  AVATAR_COLORS,
  AVATAR_EMOJI,
  BIO_MAX_LENGTH,
  describeAvatarFileProblem,
  describeUsernameProblem,
  fetchProfile,
  normalizeUsername,
  profileUrl,
  saveProfile,
  uploadAvatar,
} from '../lib/profile';
import type { AvatarColor, Profile as ProfileRecord } from '../lib/profile';
import ProfileCard from './ProfileCard';
import { getTotalFocusTime, toLocalDateString, useStore } from '../store';

const COLOR_LABELS: Record<AvatarColor, string> = {
  forest: 'Forest',
  ocean: 'Ocean',
  violet: 'Violet',
  rose: 'Rose',
  amber: 'Amber',
};

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const tasks = useStore((state) => state.tasks);
  const sessions = useStore((state) => state.sessions);

  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<ProfileRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void fetchProfile(user.id).then((profile) => {
      if (cancelled) return;
      setDraft(
        profile ?? {
          id: user.id,
          username: '',
          displayName:
            typeof user.user_metadata?.fullName === 'string' ? user.user_metadata.fullName : null,
          bio: null,
          avatarEmoji: '🌱',
          avatarColor: 'forest',
          avatarUrl: null,
          isPublic: true,
          showStreak: true,
          showFocusTime: true,
          showCompleted: true,
          createdAt: user.created_at ?? new Date().toISOString(),
        },
      );
      setLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [user]);

  function patch(changes: Partial<ProfileRecord>) {
    setDraft((current) => (current ? { ...current, ...changes } : current));
    setError(null);
    setSaved(false);
  }

  async function handleSave() {
    if (!user || !draft || saving) return;

    const problem = describeUsernameProblem(draft.username);
    if (problem) {
      setError(problem);
      return;
    }

    setSaving(true);
    setError(null);
    // The name also lives on the auth user, because that is what greets you on
    // the dashboard before any profile has loaded.
    const [, result] = await Promise.all([
      updateProfile({ fullName: draft.displayName?.trim() ?? '' }),
      saveProfile(user.id, {
        username: draft.username,
        displayName: draft.displayName,
        bio: draft.bio,
        avatarEmoji: draft.avatarEmoji,
        avatarColor: draft.avatarColor,
        avatarUrl: draft.avatarUrl,
        isPublic: draft.isPublic,
        showStreak: draft.showStreak,
        showFocusTime: draft.showFocusTime,
        showCompleted: draft.showCompleted,
      }),
    ]);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2500);
  }

  async function handleCopyLink() {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(profileUrl(draft.username));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Copying is blocked in this browser — the link is shown above.');
    }
  }

  async function handleAvatarSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear the input so choosing the same file again still fires a change
    // event — otherwise a failed upload can't be retried with the same photo.
    event.target.value = '';
    if (!file || !user) return;

    const problem = describeAvatarFileProblem(file);
    if (problem) {
      setError(problem);
      return;
    }

    setUploadingAvatar(true);
    setError(null);
    // The photo lands in storage right away — that part can't wait for Save,
    // a file input only hands you the bytes once. The profile row itself
    // still only changes when Save is pressed, same as every other field
    // here, so a photo you pick and then navigate away from is simply
    // unused, not half-applied to a card someone else can already see.
    const { url, error: uploadError } = await uploadAvatar(user.id, file);
    setUploadingAvatar(false);

    if (uploadError || !url) {
      setError(uploadError ?? 'Could not upload that photo.');
      return;
    }
    patch({ avatarUrl: url });
  }

  if (!loaded || !draft) {
    return (
      <div className="animate-in">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-panel" />
      </div>
    );
  }

  const handleProblem = draft.username ? describeUsernameProblem(draft.username) : null;
  // The preview uses this browser's own numbers, so you see the real card
  // rather than a placeholder while you decide what to share.
  const activeDates = [
    ...new Set([
      ...tasks.filter((task) => task.completed).map((task) => task.createdAt),
      ...sessions
        .filter((session) => session.completed)
        .map((session) => toLocalDateString(new Date(session.timestamp))),
    ]),
  ];

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Your profile</h1>
          <p className="page-subtitle">
            This is the card friends see when you share your link. You choose what it shows.
          </p>
        </div>
      </div>

      <div className="profile-layout">
        <div className="profile-editor">
          <section className="card" aria-labelledby="profile-basics">
            <h2 className="settings-title" id="profile-basics">
              About you
            </h2>

            <div className="settings-fields">
              <div>
                <label className="field-label" htmlFor="profile-display-name">
                  Name
                </label>
                <input
                  id="profile-display-name"
                  className="input"
                  type="text"
                  maxLength={60}
                  value={draft.displayName ?? ''}
                  placeholder="Add your name"
                  onChange={(event) => patch({ displayName: event.target.value })}
                />
              </div>
              <div>
                <label className="field-label" htmlFor="profile-username">
                  Username
                </label>
                <div className="username-field">
                  <span aria-hidden="true">@</span>
                  <input
                    id="profile-username"
                    className="input"
                    type="text"
                    maxLength={20}
                    autoComplete="off"
                    spellCheck={false}
                    value={draft.username}
                    placeholder="yourname"
                    onChange={(event) => patch({ username: normalizeUsername(event.target.value) })}
                  />
                </div>
                <small className="field-hint">
                  {handleProblem ?? '3–20 characters: lowercase letters, numbers, underscores.'}
                </small>
              </div>
            </div>

            <label className="field-label" htmlFor="profile-bio">
              Bio
            </label>
            <textarea
              id="profile-bio"
              className="input profile-bio-input"
              rows={3}
              maxLength={BIO_MAX_LENGTH}
              value={draft.bio ?? ''}
              placeholder="Second-year biology. Trying to read before midnight."
              onChange={(event) => patch({ bio: event.target.value })}
            />
            <small className="field-hint">
              {(draft.bio ?? '').length}/{BIO_MAX_LENGTH}
            </small>
          </section>

          <section className="card" aria-labelledby="profile-look">
            <h2 className="settings-title" id="profile-look">
              Your look
            </h2>
            <p className="settings-description">
              Add a photo, or pick an emoji and a colour instead — whichever feels like you.
            </p>

            <div className="avatar-upload-row">
              <span className={`profile-avatar avatar-preview avatar-${draft.avatarColor}`}>
                {draft.avatarUrl ? (
                  <img src={draft.avatarUrl} alt="" />
                ) : (
                  <span aria-hidden="true">{draft.avatarEmoji}</span>
                )}
              </span>
              <div className="avatar-upload-actions">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="visually-hidden"
                  onChange={(event) => void handleAvatarSelected(event)}
                  aria-label="Upload a profile photo"
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingAvatar}
                >
                  {uploadingAvatar ? <Loader2 size={14} className="spin" /> : <Camera size={14} />}
                  {uploadingAvatar ? 'Uploading…' : draft.avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {draft.avatarUrl && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => patch({ avatarUrl: null })}
                  >
                    <X size={14} />
                    Use emoji instead
                  </button>
                )}
                <small className="field-hint">JPG, PNG, WEBP, or GIF, up to 4MB.</small>
              </div>
            </div>

            <div className="emoji-picker" role="group" aria-label="Profile emoji">
              {AVATAR_EMOJI.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`emoji-choice${draft.avatarEmoji === emoji ? ' active' : ''}`}
                  onClick={() => patch({ avatarEmoji: emoji })}
                  aria-pressed={draft.avatarEmoji === emoji}
                  aria-label={`Use ${emoji} as your profile emoji`}
                >
                  {emoji}
                </button>
              ))}
            </div>

            <div className="color-options" role="group" aria-label="Profile colour">
              {AVATAR_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`color-option avatar-${color}${draft.avatarColor === color ? ' active' : ''}`}
                  onClick={() => patch({ avatarColor: color })}
                  aria-pressed={draft.avatarColor === color}
                >
                  <span className="color-swatch profile-swatch" aria-hidden="true" />
                  <span>{COLOR_LABELS[color]}</span>
                  {draft.avatarColor === color && <Check size={14} aria-hidden="true" />}
                </button>
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="profile-sharing">
            <h2 className="settings-title" id="profile-sharing">
              What you share
            </h2>
            <p className="settings-description">
              Your tasks are never shared — not their text, not their titles. Only the numbers you
              switch on below, and only on your own profile link.
            </p>

            <div className="share-toggles">
              <label className="share-toggle">
                <input
                  type="checkbox"
                  checked={draft.isPublic}
                  onChange={(event) => patch({ isPublic: event.target.checked })}
                />
                <span>
                  <strong>Share my profile</strong>
                  <small>Anyone with your link can open your card. Off means nobody can.</small>
                </span>
              </label>

              <label className="share-toggle">
                <input
                  type="checkbox"
                  checked={draft.showStreak}
                  disabled={!draft.isPublic}
                  onChange={(event) => patch({ showStreak: event.target.checked })}
                />
                <span>
                  <strong>Show my streak</strong>
                  <small>Days in a row, and which of the last 30 days you showed up.</small>
                </span>
              </label>

              <label className="share-toggle">
                <input
                  type="checkbox"
                  checked={draft.showCompleted}
                  disabled={!draft.isPublic}
                  onChange={(event) => patch({ showCompleted: event.target.checked })}
                />
                <span>
                  <strong>Show tasks finished</strong>
                  <small>How many you have completed in total.</small>
                </span>
              </label>

              <label className="share-toggle">
                <input
                  type="checkbox"
                  checked={draft.showFocusTime}
                  disabled={!draft.isPublic}
                  onChange={(event) => patch({ showFocusTime: event.target.checked })}
                />
                <span>
                  <strong>Show focus time</strong>
                  <small>Total time spent in focus sessions.</small>
                </span>
              </label>
            </div>
          </section>

          {error && (
            <p className="form-error" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              {error}
            </p>
          )}

          <div className="profile-actions">
            <button className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
              {saving ? 'Saving…' : 'Save profile'}
            </button>
            {saved && <span className="profile-saved-note">Saved</span>}
          </div>
        </div>

        <aside className="profile-preview">
          <h2 className="profile-preview-title">
            {draft.isPublic ? <Eye size={15} /> : <EyeOff size={15} />}
            {draft.isPublic ? 'What friends see' : 'Hidden from everyone'}
          </h2>

          <ProfileCard
            profile={{
              displayName: draft.displayName,
              username: draft.username || 'yourname',
              bio: draft.bio,
              avatarEmoji: draft.avatarEmoji,
              avatarColor: draft.avatarColor,
              avatarUrl: draft.avatarUrl,
              memberSince: draft.createdAt,
              completedTotal: draft.showCompleted
                ? tasks.filter((task) => task.completed).length
                : null,
              focusSecondsTotal: draft.showFocusTime ? getTotalFocusTime(sessions) : null,
              activeDates: draft.showStreak ? activeDates : null,
            }}
          />

          {draft.isPublic && !handleProblem && (
            <div className="profile-share-link">
              <Link2 size={14} aria-hidden="true" />
              <code>{profileUrl(draft.username)}</code>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => void handleCopyLink()}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}

          {!draft.isPublic && (
            <p className="field-hint profile-share-off">
              Your link is switched off. Turn on “Share my profile” to hand it to a friend.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
