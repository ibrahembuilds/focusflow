# Auth setup: email confirmation and Google sign-in

Both features are fully built into the app already — sign-up, log-in, the
confirmation landing page, the Google button, and the account-creation logic
that seeds a name/photo/username from whichever path someone used. What's
left is dashboard configuration only you can do, since it's your Supabase
project and your Google Cloud project.

## 0. Redirect URLs (needed by everything below)

Three different flows send the browser back to a specific in-app page after
Supabase does its part — a confirmation link, a password-reset link, and
Google's own redirect. Each one only works if its destination is on this
allow-list; anything not listed is silently refused, which looks like a
broken link with no error message.

Open **[Auth → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration)**:

- **Site URL**: `https://focusflowai.site`
- **Redirect URLs** — add all three exact paths (Supabase's own docs
  recommend exact paths over a wildcard for production; `**` wildcards are
  fine for local/preview only):
  - `https://focusflowai.site/app` — where Google sign-in lands
  - `https://focusflowai.site/confirmed` — where an email-confirmation link lands
  - `https://focusflowai.site/reset-password` — where a password-reset link lands
  - For local dev, add the same three under `http://localhost:5173/...`

## 1. Email confirmation

This is a project setting, not something the app code turns on or off.

1. Open **[Auth Providers](https://supabase.com/dashboard/project/_/auth/providers)**
   in your project's dashboard → **Email** provider → toggle **Confirm email** on.
   With it on, `supabase.auth.signUp()` creates the account but returns no
   session until the link is clicked; the app already handles this (Signup
   shows a "Check your inbox" screen with a **Resend the email** button).
2. Make sure `/confirmed` is on the Redirect URLs allow-list — see section 0
   above. Both the initial confirmation email and a resend point there
   (`src/lib/auth.tsx`'s `signUp()` and `resendConfirmationEmail()` both set
   `emailRedirectTo` explicitly, rather than relying on whatever the bare
   Site URL happens to be).
3. That's it. `src/components/auth/ConfirmEmail.tsx` handles that page — it
   shows a spinner, then either "Email confirmed" (with a way into the app)
   or a clear "link isn't valid, here's how to get a new one" state. It
   works with either of Supabase's two email-template styles (a session
   already in the URL, or a `token_hash` it verifies itself), so you don't
   need to check which one your project's template uses.

**Optional:** Auth Providers → Email also has an **Email Templates** page if
you want to customize the confirmation email's subject/wording — not
required, the default works.

## 2. Google sign-in

### In Google Cloud Console
1. Open **[APIs & Services → OAuth consent screen](https://console.cloud.google.com/auth/overview)**
   for your Google Cloud project (create one first if you don't have one).
   Set the audience, add your app name/logo, and make sure these three
   scopes are present: `openid`, `.../auth/userinfo.email`,
   `.../auth/userinfo.profile` (the last two are usually on by default).
2. Open **[APIs & Services → Credentials](https://console.cloud.google.com/auth/clients)**
   → **Create credentials → OAuth client ID** → application type
   **Web application**.
3. Under **Authorized JavaScript origins**, add `https://focusflowai.site`.
4. Under **Authorized redirect URIs**, add your Supabase project's callback
   URL — **copy the exact value shown on the Supabase Google provider page
   in step 2 below**, rather than typing it by hand; it's your specific
   project ref plus `/auth/v1/callback` and needs to match exactly.
5. Save, then copy the **Client ID** and **Client Secret** it gives you.

### In Supabase
1. Open **[Auth Providers](https://supabase.com/dashboard/project/_/auth/providers)**
   → **Google** → toggle it on.
2. Paste the **Client ID** and **Client Secret** from Google Cloud Console.
   This page also displays the exact callback URL to register with Google —
   that's the value step 4 above needs.
3. Save.

Once both sides are saved, the app's existing "Continue with Google" /
"Sign up with Google" buttons work as-is — no code changes needed. A new
Google sign-up is seeded with the name and photo Google provides
(`handle_new_user()` in `supabase/migrations/004_avatars_and_group_privacy.sql`
already reads `full_name`/`name`/`avatar_url` from the provider).
