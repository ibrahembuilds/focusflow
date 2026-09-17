import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { useAuth } from '../lib/auth';
import Seo from './Seo';

export default function NotFound() {
  const { user } = useAuth();

  return (
    <div className="not-found-page">
      <Seo title="Page not found" description="This page doesn't exist on FocusFlow." path="/404" noindex />

      <div className="empty-state">
        <Compass className="empty-state-icon" size={34} aria-hidden="true" />
        <div className="empty-state-title">This page doesn't exist</div>
        <div className="empty-state-desc">
          The link may be broken, or the page may have moved. Let's get you back to somewhere real.
        </div>
        <Link to={user ? '/app' : '/'} className="btn btn-primary">
          {user ? 'Back to your dashboard' : 'Back to FocusFlow'}
        </Link>
      </div>
    </div>
  );
}
