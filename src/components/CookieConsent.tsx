import { Link, useLocation } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { setConsent, useCookieConsent } from '../lib/consent';

// Routes that mount their own inline instance of this banner (see AppShell
// and AuthLayout) because their primary content can reach the same corner a
// floating toast would occupy — a fixed overlay covering a real button. The
// default floating instance steps aside there so the two never double up.
// Adding a new page under one of those layouts needs no change here; this
// only needs updating if a page gets its own <CookieConsent inline /> call.
const OWN_INLINE_INSTANCE_PREFIXES = ['/app', '/login', '/signup', '/forgot-password', '/reset-password', '/confirmed'];

export default function CookieConsent({ inline = false }: { inline?: boolean }) {
  const choice = useCookieConsent();
  const { pathname } = useLocation();
  if (choice !== null) return null;
  if (!inline && OWN_INLINE_INSTANCE_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    // `region`, not `dialog` — this banner is non-modal (it doesn't trap
    // focus or block the page), and `dialog` is what the onboarding modal
    // uses; sharing it would make "no dialogs open" checks see this instead.
    <div
      className={`cookie-consent${inline ? ' cookie-consent-inline' : ''}`}
      role="region"
      aria-label="Cookie preferences"
    >
      <div className="cookie-consent-inner">
        <div className="cookie-consent-copy">
          <Cookie size={20} className="cookie-consent-icon" aria-hidden="true" />
          <p>
            Signing in needs your browser's local storage to work — that part isn't optional. Anonymous
            site analytics is: we only turn it on if you say yes.{' '}
            <Link to="/privacy">Privacy Policy</Link>
          </p>
        </div>
        <div className="cookie-consent-actions">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConsent('declined')}>
            Decline analytics
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setConsent('accepted')}>
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
