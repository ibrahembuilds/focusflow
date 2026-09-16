import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.17.28-1.7V4.97H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.03l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .94 4.97l3.01 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
      />
    </svg>
  );
}

/**
 * Redirects the browser to Google and back — there's no local success state
 * to show, only a local error when the redirect itself fails to start (a
 * missing provider config, a blocked pop-up blocker on some browsers, etc).
 */
export default function GoogleSignInButton({ label }: { label: string }) {
  const { signInWithGoogle } = useAuth();
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);

  async function handleClick() {
    setError('');
    setRedirecting(true);
    const { error: signInError } = await signInWithGoogle();
    if (signInError) {
      setRedirecting(false);
      setError(signInError);
    }
    // On success the page is already navigating away; nothing left to update.
  }

  return (
    <div className="google-signin">
      <div className="auth-divider">
        <span>or</span>
      </div>
      <button
        type="button"
        className="btn btn-google btn-lg"
        onClick={() => void handleClick()}
        disabled={redirecting}
      >
        {redirecting ? <Loader2 size={16} className="spin" /> : <GoogleMark />}
        {redirecting ? 'Redirecting…' : label}
      </button>
      {error && (
        <div className="auth-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
