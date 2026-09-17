import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import AuthLayout from './AuthLayout';
import Seo from '../Seo';

type Status = 'checking' | 'success' | 'error';

/**
 * Where the "Confirm your signup" email link points (set in Supabase's Site
 * URL / Redirect URLs settings — see the Email Confirmation setup guide).
 * Supabase's project templates use one of two shapes for this, and a
 * project's template can change over time, so this handles both instead of
 * assuming one:
 *
 *  - Hash-fragment ("implicit") style: Supabase's own server verifies the
 *    token and redirects here with a session already in the URL hash
 *    (`#access_token=...&type=signup`) — the same mechanism
 *    ResetPassword.tsx already relies on for `type=recovery`. auth-js parses
 *    it automatically; this page just waits for `user` to become non-null.
 *  - Query-param ("PKCE") style: the link points straight here with
 *    `?token_hash=...&type=email`, and the app itself calls verifyOtp().
 */
export default function ConfirmEmail() {
  const { user, confirmEmail } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [status, setStatus] = useState<Status>('checking');

  const tokenHash = searchParams.get('token_hash');
  const hasSignupHash = window.location.hash.includes('type=signup');
  const linkReportedError = searchParams.get('error') || window.location.hash.includes('error=');

  useEffect(() => {
    if (linkReportedError) {
      setStatus('error');
      return;
    }
    if (user) {
      setStatus('success');
      return;
    }
    if (tokenHash) {
      let cancelled = false;
      void confirmEmail(tokenHash).then(({ error }) => {
        if (!cancelled) setStatus(error ? 'error' : 'success');
      });
      return () => {
        cancelled = true;
      };
    }
    if (hasSignupHash) {
      // Give auth-js a moment to parse the hash and establish the session
      // (same timing ResetPassword.tsx uses for recovery links) before
      // concluding the link didn't actually work.
      const timeout = setTimeout(() => setStatus((current) => (current === 'checking' ? 'error' : current)), 5000);
      return () => clearTimeout(timeout);
    }
    // No recognizable confirmation payload at all — someone landed here directly.
    setStatus('error');
  }, [user, tokenHash, hasSignupHash, linkReportedError, confirmEmail]);

  if (status === 'success') {
    return (
      <AuthLayout eyebrow="You're in" title="Email confirmed" subtitle="Your account is ready to go.">
        <Seo title="Email confirmed" description="Your FocusFlow account is confirmed." path="/confirmed" noindex />
        <div className="auth-confirm-notice">
          <CheckCircle2 size={22} />
          <p>Thanks for confirming — you're all set.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg auth-submit"
          onClick={() => navigate(user ? '/app' : '/login', { replace: true })}
        >
          {user ? 'Go to dashboard' : 'Log in'}
        </button>
      </AuthLayout>
    );
  }

  if (status === 'error') {
    return (
      <AuthLayout
        eyebrow="Link problem"
        title="This confirmation link isn't valid"
        subtitle="It may have expired or already been used."
      >
        <Seo title="Invalid confirmation link" description="Confirm your FocusFlow account." path="/confirmed" noindex />
        <div className="auth-error" role="alert">
          <AlertCircle size={16} />
          <span>Log in — if your account still needs confirming, you can resend the email from there.</span>
        </div>
        <p className="auth-switch">
          <Link to="/login">Back to log in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <div className="auth-loading" role="status" aria-label="Confirming your email">
      <div className="auth-loading-spinner" />
    </div>
  );
}
