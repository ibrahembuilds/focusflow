import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, Check, CheckCircle2, Lock } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import AuthLayout from './AuthLayout';
import Seo from '../Seo';

export default function ResetPassword() {
  const { user, updatePassword } = useAuth();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [gaveUpWaiting, setGaveUpWaiting] = useState(false);

  const hasRecoveryHash = window.location.hash.includes('type=recovery');

  useEffect(() => {
    if (user || !hasRecoveryHash) return;
    // Supabase parses the recovery link's URL hash and establishes a
    // session asynchronously, shortly after this page mounts. Give it a
    // few seconds before concluding the link is actually invalid.
    const timeout = setTimeout(() => setGaveUpWaiting(true), 5000);
    return () => clearTimeout(timeout);
  }, [user, hasRecoveryHash]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await updatePassword(password);
    setSubmitting(false);

    if (updateError) {
      setError(updateError);
      return;
    }
    setSuccess(true);
  }

  if (success) {
    return (
      <AuthLayout eyebrow="All set" title="Password updated" subtitle="You're ready to keep focusing.">
        <Seo title="Password updated" description="Your FocusFlow password has been updated." path="/reset-password" noindex />
        <div className="auth-confirm-notice">
          <CheckCircle2 size={22} />
          <p>Your password has been changed.</p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-lg auth-submit"
          onClick={() => navigate('/app', { replace: true })}
        >
          Go to dashboard
        </button>
      </AuthLayout>
    );
  }

  if (!hasRecoveryHash || (gaveUpWaiting && !user)) {
    return (
      <AuthLayout eyebrow="Link problem" title="This reset link isn't valid" subtitle="It may have expired or already been used.">
        <Seo title="Invalid reset link" description="Request a new FocusFlow password reset link." path="/reset-password" noindex />
        <div className="auth-error" role="alert">
          <AlertCircle size={16} />
          <span>Request a new password reset link and try again.</span>
        </div>
        <p className="auth-switch">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </AuthLayout>
    );
  }

  if (!user) {
    return (
      <div className="auth-loading" role="status" aria-label="Verifying reset link">
        <div className="auth-loading-spinner" />
      </div>
    );
  }

  return (
    <AuthLayout eyebrow="Almost done" title="Choose a new password" subtitle="Pick something you haven't used before.">
      <Seo title="Choose a new password" description="Choose a new FocusFlow password." path="/reset-password" noindex />
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <div className="auth-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="new-password">New password</label>
          <div className="auth-input-wrap">
            <Lock size={16} aria-hidden="true" />
            <input
              id="new-password"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              autoFocus
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="confirm-password">Confirm password</label>
          <div className="auth-input-wrap">
            <Lock size={16} aria-hidden="true" />
            <input
              id="confirm-password"
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
            />
          </div>
        </div>

        <button className="btn btn-primary btn-lg auth-submit" type="submit" disabled={submitting}>
          <Check size={17} />
          {submitting ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </AuthLayout>
  );
}
