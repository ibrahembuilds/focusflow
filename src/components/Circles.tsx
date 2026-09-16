import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, LogIn, Loader2, AlertTriangle, AtSign } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { fetchProfile } from '../lib/profile';
import type { Profile } from '../lib/profile';
import { createCircle, fetchMyCircles, joinCircleByCode } from '../lib/circles';
import type { Circle } from '../lib/circles';

const EMOJI_CHOICES = ['🎯', '📚', '💪', '🧑‍💻', '🎓', '🚀', '☕', '🏡'] as const;

export default function Circles() {
  const { user } = useAuth();
  const [circles, setCircles] = useState<Circle[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState<string>(EMOJI_CHOICES[0]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      const [circleResult, profileResult] = await Promise.all([
        fetchMyCircles(),
        fetchProfile(user.id),
      ]);
      if (cancelled) return;
      setCircles(circleResult.data ?? []);
      setLoadError(circleResult.error);
      setProfile(profileResult);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || creating) return;

    setCreating(true);
    setCreateError(null);
    const { data, error } = await createCircle(trimmed, emoji);
    setCreating(false);

    if (error || !data) {
      setCreateError(error ?? 'Could not create that circle.');
      return;
    }
    setCircles((current) => [...current, data]);
    setName('');
  }

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    if (joining) return;

    setJoining(true);
    setJoinError(null);
    const { data, error } = await joinCircleByCode(code);
    setJoining(false);

    if (error || !data) {
      setJoinError(error ?? 'Could not join that circle.');
      return;
    }
    setCircles((current) =>
      current.some((circle) => circle.id === data.id) ? current : [...current, data],
    );
    setCode('');
  }

  return (
    <div className="animate-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Circles</h1>
          <p className="page-subtitle">
            A shared list for your study group, your friends, or your team — plus everyone's streak
            in one place.
          </p>
        </div>
      </div>

      {profile?.username && (
        <div className="handle-chip">
          <AtSign size={14} aria-hidden="true" />
          <span>
            You are <strong>@{profile.username}</strong> to your circles.
          </span>
          <Link to="/app/settings" className="handle-chip-link">
            Change
          </Link>
        </div>
      )}

      <div className="circle-forms">
        <form className="card circle-form" onSubmit={handleCreate}>
          <h2 className="settings-title">Start a circle</h2>
          <p className="settings-description">
            You get an invite code to share. Anyone with the code can join.
          </p>
          <label className="field-label" htmlFor="circle-name">
            Circle name
          </label>
          <input
            id="circle-name"
            className="input"
            value={name}
            maxLength={60}
            placeholder="Example: Biology finals"
            onChange={(event) => setName(event.target.value)}
          />
          <div className="emoji-picker" role="group" aria-label="Circle icon">
            {EMOJI_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                className={`emoji-choice${emoji === choice ? ' active' : ''}`}
                onClick={() => setEmoji(choice)}
                aria-pressed={emoji === choice}
                aria-label={`Use ${choice} as the circle icon`}
              >
                {choice}
              </button>
            ))}
          </div>
          {createError && (
            <p className="form-error" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              {createError}
            </p>
          )}
          <button className="btn btn-primary" type="submit" disabled={creating || !name.trim()}>
            {creating ? <Loader2 size={16} className="spin" /> : <Plus size={16} />}
            Create circle
          </button>
        </form>

        <form className="card circle-form" onSubmit={handleJoin}>
          <h2 className="settings-title">Join a circle</h2>
          <p className="settings-description">Paste the 6-character code a friend sent you.</p>
          <label className="field-label" htmlFor="circle-code">
            Invite code
          </label>
          <input
            id="circle-code"
            className="input invite-code-input"
            value={code}
            maxLength={6}
            placeholder="A1B2C3"
            autoComplete="off"
            onChange={(event) => setCode(event.target.value.toUpperCase())}
          />
          {joinError && (
            <p className="form-error" role="alert">
              <AlertTriangle size={14} aria-hidden="true" />
              {joinError}
            </p>
          )}
          <button className="btn btn-primary" type="submit" disabled={joining || !code.trim()}>
            {joining ? <Loader2 size={16} className="spin" /> : <LogIn size={16} />}
            Join
          </button>
        </form>
      </div>

      {loadError && (
        <p className="form-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="skeleton skeleton-panel" aria-label="Loading circles" role="status" />
      ) : circles.length === 0 ? (
        <div className="empty-state">
          <Users className="empty-state-icon" size={34} aria-hidden="true" />
          <div className="empty-state-title">No circles yet</div>
          <div className="empty-state-desc">
            Create one above and send the code to a classmate, a friend, or a coworker.
          </div>
        </div>
      ) : (
        <div className="circle-grid">
          {circles.map((circle) => (
            <Link key={circle.id} to={`/app/circles/${circle.id}`} className="card circle-card">
              <span className="circle-card-emoji" aria-hidden="true">
                {circle.emoji}
              </span>
              <span className="circle-card-body">
                <strong>{circle.name}</strong>
                <small>
                  Code {circle.inviteCode}
                  {circle.ownerId === user?.id ? ' · you started this' : ''}
                </small>
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
