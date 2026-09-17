import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { UserPlus, Mail, Lock, User, AtSign, Eye, EyeOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { describeUsernameProblem } from '../../lib/profile';
import AuthLayout from './AuthLayout';
import GoogleSignInButton from './GoogleSignInButton';
import Seo from '../Seo';

export default function Signup() {
  const { user, loading, signUp, resendConfirmationEmail } = useAuth();

  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleResend() {
    setResending(true);
    setResent(false);
    const { error: resendError } = await resendConfirmationEmail(email);
    setResending(false);
    if (!resendError) setResent(true);
  }

  if (!loading && user) {
    return <Navigate to="/app" replace />;
  }

  // Both are optional — sign-up still works with just email and password —
  // so this only ever blocks submit for a handle that's actually typed and
  // actually invalid, never for leaving it blank.
  const usernameProblem = username.trim() ? describeUsernameProblem(username) : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (usernameProblem) {
      setError(usernameProblem);
      return;
    }

    setSubmitting(true);
    const { error: signUpError } = await signUp(email.trim(), password, {
      fullName: name.trim() || undefined,
      preferredUsername: username.trim() || undefined,
    });
    setSubmitting(false);

    if (signUpError) {
      setError(signUpError);
      return;
    }

    // If email confirmation is off, Supabase returns an active session, the
    // auth listener updates `user`, and the redirect guard above takes over.
    // Otherwise this notice explains the next step.
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <AuthLayout
        eyebrow="Almost there"
        title="Check your inbox"
        subtitle="We've sent a confirmation link. Once you confirm, log in to get started."
      >
        <Seo title="Check your inbox" description="Confirm your FocusFlow account." path="/signup" noindex />
        <div className="auth-confirm-notice">
          <CheckCircle2 size={22} />
          <p>
            If your project requires email confirmation, verify <strong>{email}</strong> and then{' '}
            <Link to="/login">log in</Link>.
          </p>
        </div>

        <p className="auth-field-hint" style={{ textAlign: 'center', marginTop: '1rem' }}>
          {resent ? (
            'Sent again — check your inbox (and spam folder).'
          ) : (
            <>
              Didn't get it?{' '}
              <button
                type="button"
                className="auth-forgot-link"
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                onClick={handleResend}
                disabled={resending}
              >
                {resending ? 'Resending…' : 'Resend the email'}
              </button>
            </>
          )}
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      eyebrow="Get started"
      title="Create your account"
      subtitle="Free to start. Your tasks and sessions stay private to you."
    >
      <Seo title="Sign up" description="Create a free FocusFlow account to start planning your day." path="/signup" />
      <form className="auth-form" onSubmit={handleSubmit}>
        {error && (
          <div className="auth-error" role="alert">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <div className="auth-field">
          <label htmlFor="signup-name">Name</label>
          <div className="auth-input-wrap">
            <User size={16} aria-hidden="true" />
            <input
              id="signup-name"
              className="input"
              type="text"
              autoComplete="name"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Optional — shown on your profile card"
              autoFocus
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="signup-username">Username</label>
          <div className="auth-input-wrap">
            <AtSign size={16} aria-hidden="true" />
            <input
              id="signup-username"
              className="input"
              type="text"
              autoComplete="username"
              maxLength={20}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Optional — we'll pick one if you skip it"
              aria-invalid={usernameProblem ? true : undefined}
            />
          </div>
          {username.trim() && (
            <p className={`auth-field-hint ${usernameProblem ? 'problem' : ''}`}>
              {usernameProblem ?? `Your profile link will be focusflowai.site/u/${username.trim().toLowerCase()}`}
            </p>
          )}
        </div>

        <div className="auth-field">
          <label htmlFor="signup-email">Email</label>
          <div className="auth-input-wrap">
            <Mail size={16} aria-hidden="true" />
            <input
              id="signup-email"
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

        <div className="auth-field">
          <label htmlFor="signup-password">Password</label>
          <div className="auth-input-wrap has-toggle">
            <Lock size={16} aria-hidden="true" />
            <input
              id="signup-password"
              className="input"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
            />
            <button
              type="button"
              className="auth-toggle-visibility"
              onClick={() => setShowPassword((v) => !v)}
              // Deliberately doesn't contain the word "password" — this sits
              // right next to a field whose own accessible name is
              // "Password", and a substring match like getByLabel('Password')
              // (used throughout the E2E suite) would otherwise resolve to
              // both.
              aria-label={showPassword ? 'Hide characters' : 'Show characters'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          className="btn btn-primary btn-lg auth-submit"
          type="submit"
          disabled={submitting || !!usernameProblem}
        >
          <UserPlus size={17} />
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <GoogleSignInButton label="Sign up with Google" />

      <p className="auth-legal">
        By creating an account, you agree to our <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <p className="auth-switch">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </AuthLayout>
  );
}
