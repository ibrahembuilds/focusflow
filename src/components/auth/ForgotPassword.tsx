import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Mail, AlertCircle, CheckCircle2, SendHorizontal } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import AuthLayout from './AuthLayout';
import Seo from '../Seo';

export default function ForgotPassword() {
  const { resetPasswordForEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    const { error: resetError } = await resetPasswordForEmail(email.trim());
    setSubmitting(false);

    if (resetError) {
      setError(resetError);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout
        eyebrow="Check your inbox"
        title="Reset link sent"
        subtitle="Follow the link we emailed you to choose a new password."
      >
        <Seo title="Reset your password" description="Reset your FocusFlow password." path="/forgot-password" noindex />
        <div className="auth-confirm-notice">
          <CheckCircle2 size={22} />
          <p>
            We sent a password reset link to <strong>{email}</strong>. It expires soon, so use it shortly after it arrives.
          </p>
        </div>
        <p className="auth-switch">
          <Link to="/login">Back to log in</Link>
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Forgot password"
      title="Reset your password"
      subtitle="Enter your email and we'll send you a link to choose a new one."
    >
      <Seo title="Forgot password" description="Reset your FocusFlow password." path="/forgot-password" noindex />
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <div className="auth-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="forgot-email">Email</label>
          <div className="auth-input-wrap">
            <Mail size={16} aria-hidden="true" />
            <input
              id="forgot-email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
        </div>

        <button className="btn btn-primary btn-lg auth-submit" type="submit" disabled={submitting}>
          <SendHorizontal size={17} />
          {submitting ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="auth-switch">
        Remembered it? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
