# Auth setup: email confirmation and Google sign-in

Both features are fully built into the app already — sign-up, log-in, the
confirmation landing page, the Google button, and the account-creation logic
that seeds a name/photo/username from whichever path someone used. What's
left is dashboard configuration only you can do, since it's your Supabase
project and your Google Cloud project.

## 1. Email confirmation

This is a project setting, not something the app code turns on or off.

1. Open **[Auth Providers](https://supabase.com/dashboard/project/_/auth/providers)**
   in your project's dashboard → **Email** provider → toggle **Confirm email** on.
   With it on, `supabase.auth.signUp()` creates the account but returns no
   session until the link is clicked; the app already handles this (Signup
   shows a "Check your inbox" screen with a **Resend the email** button).
2. Open **[Auth → URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration)**
   and make sure your real domain is registered:
   - **Site URL**: `https://focusflowai.site`
   - **Redirect URLs**: add `https://focusflowai.site/confirmed` (and
     `http://localhost:5173/confirmed` too, for local dev). A confirmation
     link can only redirect to an address on this list — Supabase silently
     refuses anything else.
3. That's it. The confirmation email's link already points wherever `Site
   URL` + the app's `emailRedirectTo` say to (`/confirmed`), and
   `src/components/auth/ConfirmEmail.tsx` handles that page — it shows a
   spinner, then either "Email confirmed" (with a way into the app) or a
   clear "link isn't valid, here's how to get a new one" state. It works
   with either of Supabase's two email-template styles (a session already in
   the URL, or a `token_hash` it verifies itself), so you don't need to
   check which one your project's template uses.

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
