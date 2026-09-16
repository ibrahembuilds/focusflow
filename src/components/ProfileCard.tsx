import { Flame, CheckCircle2, Timer } from 'lucide-react';
import type { AvatarColor } from '../lib/profile';
import { streakFromDates, toLocalDateString } from '../store';

export interface ProfileCardData {
  displayName: string | null;
  username: string;
  bio: string | null;
  avatarEmoji: string;
  avatarColor: AvatarColor;
  memberSince: string | null;
  /** Null means the owner keeps this number to themselves. */
  completedTotal: number | null;
  focusSecondsTotal: number | null;
  activeDates: string[] | null;
}

const ACTIVITY_DAYS = 30;

/**
 * Whole minutes and hours. A profile is a summary, not a stopwatch — and
 * "0s" on a brand-new card reads like something failed to load.
 */
function compactDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return `${minutes}m`;
}

function recentDays(active: Set<string>) {
  return Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (ACTIVITY_DAYS - 1 - index));
    const key = toLocalDateString(date);
    return { key, on: active.has(key) };
  });
}

export default function ProfileCard({ profile }: { profile: ProfileCardData }) {
  const active = new Set(profile.activeDates ?? []);
  const sharesSomething =
    profile.activeDates !== null ||
    profile.completedTotal !== null ||
    profile.focusSecondsTotal !== null;

  return (
    <article className={`profile-card avatar-${profile.avatarColor}`}>
      <div className="profile-card-band" aria-hidden="true" />

      <div className="profile-card-identity">
        <span className="profile-avatar" aria-hidden="true">
          {profile.avatarEmoji}
        </span>
        <h2 className="profile-card-name">{profile.displayName?.trim() || `@${profile.username}`}</h2>
        <p className="profile-card-handle">@{profile.username}</p>
      </div>

      {profile.bio && <p className="profile-card-bio">{profile.bio}</p>}

      {sharesSomething && (
        <dl className="profile-stats">
          {profile.activeDates !== null && (
            <div className="profile-stat">
              <dt>
                <Flame size={15} aria-hidden="true" />
                Streak
              </dt>
              <dd>
                {streakFromDates(active)}
                <small>{streakFromDates(active) === 1 ? 'day' : 'days'}</small>
              </dd>
            </div>
          )}
          {profile.completedTotal !== null && (
            <div className="profile-stat">
              <dt>
                <CheckCircle2 size={15} aria-hidden="true" />
                Finished
              </dt>
              <dd>
                {profile.completedTotal}
                <small>{profile.completedTotal === 1 ? 'task' : 'tasks'}</small>
              </dd>
            </div>
          )}
          {profile.focusSecondsTotal !== null && (
            <div className="profile-stat">
              <dt>
                <Timer size={15} aria-hidden="true" />
                Focused
              </dt>
              <dd>{compactDuration(profile.focusSecondsTotal)}</dd>
            </div>
          )}
        </dl>
      )}

      {profile.activeDates !== null && (
        <div className="profile-activity">
          <span className="profile-activity-label">Last 30 days</span>
          <div className="profile-activity-grid" role="img" aria-label={`Active on ${active.size} of the last ${ACTIVITY_DAYS} days`}>
            {recentDays(active).map((day) => (
              <span key={day.key} className={`profile-activity-day${day.on ? ' on' : ''}`} title={day.key} />
            ))}
          </div>
        </div>
      )}

      {!sharesSomething && (
        <p className="profile-card-quiet">
          {profile.displayName?.trim() || `@${profile.username}`} keeps their numbers private.
        </p>
      )}

      {profile.memberSince && (
        <p className="profile-card-since">
          On FocusFlow since{' '}
          {new Date(profile.memberSince).toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          })}
        </p>
      )}
    </article>
  );
}
