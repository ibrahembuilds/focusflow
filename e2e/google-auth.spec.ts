import { test, expect } from '@playwright/test';
import { backendState, resetBackend, signInWithGoogle, uniqueEmail } from './helpers';

/**
 * There is no real Google here — e2e/fake-supabase.mjs's `/authorize` stands
 * in for it, minting a session the same way a real IdP redirect eventually
 * does. These tests prove the app's OAuth *plumbing*: the button redirects
 * out with the right provider, the session in the URL fragment is parsed on
 * return, and the account/profile that comes back is real and durable. They
 * cannot and do not prove anything about Google's own consent screen —
 * nothing outside Google can.
 */
test.describe('signing in with Google', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('a new Google sign-up lands signed in, with a name and photo already set', async ({
    page,
    request,
  }) => {
    await page.goto('/signup');
    await signInWithGoogle(page, { buttonLabel: 'Sign up with Google' });

    // `signInWithGoogle` already waits for the app shell to mount; the exact
    // trailing character here isn't stable across browsers (auth-js clears
    // the hash via `location.hash = ''`, which some engines leave as a bare
    // `#`), so check the path only.
    expect(new URL(page.url()).pathname).toBe('/app');

    const state = await backendState(request);
    expect(state.users).toHaveLength(1);
    const profile = state.profiles[0];

    // Seeded straight from the (fake) provider's metadata — nobody had to
    // type a name or pick an avatar to get a usable profile.
    expect(profile.display_name).toBe('Google User');
    expect(profile.avatar_url).toMatch(/^https:\/\//);
    expect(profile.username).toMatch(/^[a-z0-9_]{3,20}$/);

    // And the seeded photo is what actually renders on the card.
    await page.goto('/app/profile');
    await expect(page.locator('.avatar-preview img')).toHaveAttribute('src', profile.avatar_url!);
  });

  test('signing in with Google a second time reuses the same account', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('googler').replace('@focusflow.test', '@gmail.test');

    await page.goto('/signup');
    await signInWithGoogle(page, { buttonLabel: 'Sign up with Google', loginHint: email });
    const afterFirst = await backendState(request);
    expect(afterFirst.users).toHaveLength(1);
    const firstId = afterFirst.users[0].id;

    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/app'));

    // Back in through the Login page's button this time — same identity.
    await page.goto('/login');
    await signInWithGoogle(page, { buttonLabel: 'Continue with Google', loginHint: email });

    const afterSecond = await backendState(request);
    expect(afterSecond.users).toHaveLength(1); // still one account, not two
    expect(afterSecond.users[0].id).toBe(firstId);
  });

  // There is deliberately no "the button shows an error on a network failure"
  // test here. `signInWithOAuth` doesn't fetch the authorize URL and await a
  // response — for a real redirect it computes the URL and calls
  // `window.location.assign(url)`, then resolves successfully regardless of
  // whether that navigation later succeeds. A broken or unconfigured
  // provider therefore doesn't surface as anything this app's own error UI
  // can catch: the browser simply leaves the SPA and lands on whatever
  // GoTrue (or Google) serves at that URL instead. `GoogleSignInButton`'s
  // `auth-error` branch exists for the one case that *can* still happen
  // in-app — `signInWithOAuth` resolving with an error before any redirect
  // fires — which nothing in this fake backend can trigger, since it always
  // answers `/authorize` with a redirect.
});
