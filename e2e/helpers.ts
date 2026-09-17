import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { SUPABASE_URL } from '../playwright.config';

export interface BackendState {
  users: { id: string; email: string }[];
  profiles: {
    id: string;
    username: string;
    display_name: string | null;
    bio: string | null;
    avatar_emoji: string;
    avatar_color: string;
    avatar_url: string | null;
    is_public: boolean;
    show_streak: boolean;
    show_focus_time: boolean;
    show_completed: boolean;
  }[];
  circles: {
    id: string;
    name: string;
    owner_id: string;
    invite_code: string;
    require_approval: boolean;
  }[];
  circle_members: { circle_id: string; user_id: string; role: string }[];
  circle_join_requests: { circle_id: string; user_id: string; requested_at: string }[];
  tasks: {
    id: string;
    user_id: string;
    text: string;
    completed: boolean;
    circle_id: string | null;
    completed_by: string | null;
    created_at: string;
  }[];
  timer_sessions: { id: string; user_id: string; duration: number; completed: boolean }[];
}

/** Empty the fake backend so each spec starts from a known state. */
export async function resetBackend(request: APIRequestContext) {
  const response = await request.post(`${SUPABASE_URL}/__test/reset`);
  expect(response.ok()).toBeTruthy();
}

/** Read the rows the backend actually holds — the proof a task really saved. */
export async function backendState(request: APIRequestContext): Promise<BackendState> {
  const response = await request.get(`${SUPABASE_URL}/__test/state`);
  expect(response.ok()).toBeTruthy();
  return response.json() as Promise<BackendState>;
}

export function uniqueEmail(prefix: string) {
  return `${prefix}.${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@focusflow.test`;
}

export const PASSWORD = 'focusflow-test-pw';

export async function signUp(page: Page, email: string, password = PASSWORD) {
  await page.goto('/signup');
  await dismissCookieConsent(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/app');
  await dismissOnboarding(page);
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await dismissCookieConsent(page);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/app');
  await dismissOnboarding(page);
}

/**
 * The cookie banner is global (rendered outside the route switch, so it can
 * appear on the auth pages too, before there's even an app shell to wait
 * for) and fixed to a screen corner — close enough to real content on a
 * default-size viewport that leaving it up risks an unrelated click landing
 * on it instead. Resolving it here, right after the pages that can show it
 * first, means no test has to think about it to get a clean click.
 */
export async function dismissCookieConsent(page: Page) {
  const banner = page.locator('.cookie-consent');
  const appeared = await banner
    .waitFor({ state: 'visible', timeout: 2000 })
    .then(() => true)
    .catch(() => false);

  if (appeared) {
    await banner.getByRole('button', { name: 'Accept' }).click();
  }
  await expect(banner).toHaveCount(0);
}

export async function logOut(page: Page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/app'));
}

/**
 * The welcome overlay covers the app on a fresh account. It mounts a moment
 * after the route does, so wait for it before deciding it isn't there.
 */
export async function dismissOnboarding(page: Page) {
  await page.locator('.app-shell').waitFor();
  const dialog = page.getByRole('dialog');
  const appeared = await dialog
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true)
    .catch(() => false);

  if (appeared) {
    await page.getByRole('button', { name: 'Skip welcome guide' }).click();
  }
  await expect(dialog).toHaveCount(0);
}

export async function addPersonalTask(page: Page, text: string) {
  await page.goto('/app/tasks');
  await page.getByPlaceholder('What do you want to accomplish?').fill(text);
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
}

/** A real, tiny PNG on disk — used to prove an avatar upload round-trips real bytes. */
export const AVATAR_FIXTURE = new URL('./fixtures/avatar.png', import.meta.url).pathname;
export const AVATAR_FIXTURE_2 = new URL('./fixtures/avatar-2.png', import.meta.url).pathname;

/**
 * Clicks "Continue with Google" (or "Sign up with Google") and follows the
 * redirect through e2e/fake-supabase.mjs's `/authorize` stand-in, which
 * mints a session the same way a real IdP redirect eventually does. This
 * proves the app's OAuth *plumbing* — the redirect out, parsing the session
 * back from the URL, landing signed in — not Google's own consent screen,
 * which nothing outside Google can exercise.
 *
 * `loginHint` reuses the same fake Google identity across calls, so a test
 * can simulate the same person signing in with Google twice. It's injected
 * by rewriting the outgoing request here, in the test, rather than by
 * teaching the production button to send a test-only query parameter.
 */
export async function signInWithGoogle(
  page: Page,
  { buttonLabel = 'Continue with Google', loginHint }: { buttonLabel?: string; loginHint?: string } = {},
) {
  if (loginHint) {
    await page.route('**/auth/v1/authorize**', (route) => {
      const url = new URL(route.request().url());
      url.searchParams.set('login_hint', loginHint);
      return route.continue({ url: url.toString() });
    });
  }
  await page.getByRole('button', { name: buttonLabel }).click();
  // This is a real cross-document redirect, not an in-app route change, so
  // the URL lands as `/app#access_token=...` and then loses the hash via
  // `history.replaceState` once auth-js parses the session out of it — a
  // same-document change with no `load` event. Matching on `**/app` with the
  // default `waitUntil: 'load'` misses both: the first URL doesn't end in
  // exactly `/app`, and the second never fires `load`. Checking the path
  // alone sidesteps both.
  await page.waitForURL((url) => url.pathname.endsWith('/app'));
  await dismissOnboarding(page);
}
