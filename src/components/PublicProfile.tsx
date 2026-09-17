import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, UserX } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { fetchPublicProfile } from '../lib/profile';
import type { PublicProfile as SharedProfile } from '../lib/profile';
import ProfileCard from './ProfileCard';
import Seo from './Seo';

export default function PublicProfile() {
  const { username = '' } = useParams();
  const { user } = useAuth();
  const [profile, setProfile] = useState<SharedProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void fetchPublicProfile(username).then((result) => {
      if (cancelled) return;
      setProfile(result);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [username]);

  const name = profile?.displayName?.trim() || `@${profile?.username ?? username}`;

  return (
    <div className="public-profile-page">
      <Seo
        // Seo already appends " | FocusFlow" to every title — folding the
        // site name in here too used to produce "Ibrahem on FocusFlow |
        // FocusFlow" in the tab and in search results.
        title={profile ? name : 'Profile'}
        description={profile?.bio ?? `${name}'s focus profile on FocusFlow.`}
        path={`/u/${username}`}
        noindex={!profile}
        // A real uploaded photo makes a far better share-link preview than
        // the generic site logo every other page falls back to.
        image={profile?.avatarUrl ?? undefined}
      />

      <header className="public-profile-header">
        <Link to={user ? '/app' : '/'} className="back-link">
          <ArrowLeft size={15} aria-hidden="true" />
          {user ? 'Back to FocusFlow' : 'FocusFlow'}
        </Link>
      </header>

      <main className="public-profile-main">
        {loading ? (
          <div className="skeleton skeleton-panel" aria-label="Loading profile" role="status" />
        ) : profile ? (
          <>
            <ProfileCard
              profile={{
                displayName: profile.displayName,
                username: profile.username,
                bio: profile.bio,
                avatarEmoji: profile.avatarEmoji,
                avatarColor: profile.avatarColor,
                avatarUrl: profile.avatarUrl,
                memberSince: profile.memberSince,
                completedTotal: profile.completedTotal,
                focusSecondsTotal: profile.focusSecondsTotal,
                activeDates: profile.activeDates,
              }}
            />
            {!user && (
              <div className="public-profile-cta">
                <p>Build your own streak alongside {name}.</p>
                <Link to="/signup" className="btn btn-primary">
                  Start free
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state">
            <UserX className="empty-state-icon" size={34} aria-hidden="true" />
            <div className="empty-state-title">Nothing to see here</div>
            <div className="empty-state-desc">
              There's no shared profile at <strong>@{username}</strong>. The handle may be wrong, or
              its owner keeps their profile private.
            </div>
            <Link to={user ? '/app/circles' : '/'} className="btn btn-primary">
              {user ? 'Back to circles' : 'Go to FocusFlow'}
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
