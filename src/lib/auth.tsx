import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signUp: (
    email: string,
    password: string,
    profile?: { fullName?: string; preferredUsername?: string },
  ) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  /** Redirects the browser to Google, then back to /app already signed in. */
  signInWithGoogle: () => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateProfile: (data: { fullName?: string }) => Promise<{ error: string | null }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
  /** Re-sends the "confirm your account" email — for someone who missed or lost the first one. */
  resendConfirmationEmail: (email: string) => Promise<{ error: string | null }>;
  /** Completes the query-param style confirmation link (?token_hash=...&type=email). */
  confirmEmail: (tokenHash: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function signUp(
    email: string,
    password: string,
    profile?: { fullName?: string; preferredUsername?: string },
  ) {
    // Read by handle_new_user() (supabase/migrations/005_signup_chosen_username.sql)
    // as part of the same transaction that creates the account — not applied
    // client-side afterward, since a project requiring email confirmation has
    // no active session yet to write with at that point.
    const data: Record<string, string> = {};
    if (profile?.fullName) data.fullName = profile.fullName;
    if (profile?.preferredUsername) data.preferredUsername = profile.preferredUsername;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        ...(Object.keys(data).length > 0 ? { data } : {}),
        // Without this, the confirmation email falls back to the project's
        // bare Site URL — skipping ConfirmEmail.tsx entirely for every
        // first-time signup, even though resendConfirmationEmail() below
        // already gets this right for a resend.
        emailRedirectTo: `${window.location.origin}/confirmed`,
      },
    });
    return { error: error?.message ?? null };
  }

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signInWithGoogle() {
    // This kicks off a redirect — the browser leaves the page, so there's
    // nothing useful to return on success. `onAuthStateChange` above picks up
    // the session once Google sends the browser back to `redirectTo`.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/app` },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function updateProfile(data: { fullName?: string }) {
    const { error } = await supabase.auth.updateUser({ data });
    return { error: error?.message ?? null };
  }

  async function resetPasswordForEmail(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    return { error: error?.message ?? null };
  }

  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error?.message ?? null };
  }

  async function resendConfirmationEmail(email: string) {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: `${window.location.origin}/confirmed` },
    });
    return { error: error?.message ?? null };
  }

  // Only needed for a project whose email template links to `?token_hash=...`
  // (Supabase's newer default) rather than redirecting back with a session
  // already in the URL hash (the older default, and the one ResetPassword.tsx
  // already relies on for recovery links) — ConfirmEmail.tsx tries this only
  // when there's a token_hash to verify.
  async function confirmEmail(tokenHash: string) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    return { error: error?.message ?? null };
  }

  return (
    <AuthContext.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        signUp,
        signIn,
        signInWithGoogle,
        signOut,
        updateProfile,
        resetPasswordForEmail,
        updatePassword,
        resendConfirmationEmail,
        confirmEmail,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
