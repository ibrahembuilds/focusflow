import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';
import { setConsent, useCookieConsent } from '../lib/consent';

export default function CookieConsent() {
  const choice = useCookieConsent();
  if (choice !== null) return null;

  return (
    // `region`, not `dialog` — this banner is non-modal (it doesn't trap
    // focus or block the page), and `dialog` is what the onboarding modal
    // uses; sharing it would make "no dialogs open" checks see this instead.
    <div className="cookie-consent" role="region" aria-label="Cookie preferences">
      <div className="cookie-consent-inner">
        <Cookie size={20} className="cookie-consent-icon" aria-hidden="true" />
        <p>
          Signing in needs your browser's local storage to work — that part isn't optional. Anonymous
          site analytics is: we only turn it on if you say yes.{' '}
          <Link to="/privacy">Privacy Policy</Link>
        </p>
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
