import { test, expect } from '@playwright/test';
import { PASSWORD, resetBackend, uniqueEmail } from './helpers';

test.describe('onboarding name reaches your actual profile', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('naming yourself during onboarding shows up on the sidebar and the profile card', async ({
    page,
  }) => {
    const email = uniqueEmail('onboardname');
    await page.goto('/signup');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/app');

    // Walk the real flow instead of skipping it — this is exactly the path
    // that used to leave the profile card's name blank.
    await page.getByRole('dialog').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: 'Continue' }).click(); // welcome -> name
    await page.getByLabel('Your name').fill('Priya Sharma');
    await page.getByRole('button', { name: 'Continue' }).click(); // name -> first task
    await page.getByRole('button', { name: 'Continue' }).click(); // skip the task, blank is fine
    await page.getByRole('button', { name: 'Start focusing' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // The sidebar greeting (reads the auth user's own metadata).
    await expect(page.locator('.sidebar-account-email')).toHaveText('Priya Sharma');

    // The actual shareable profile card (reads the profiles table) — this
    // is the part that used to stay blank.
    await page.goto('/app/profile');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Priya Sharma');
    await expect(page.locator('.profile-preview .profile-card-name')).toHaveText('Priya Sharma');
  });

  test('declining to name yourself leaves the card on its handle, not blank forever', async ({
    page,
  }) => {
    await page.goto('/signup');
    await page.getByLabel('Email').fill(uniqueEmail('noname'));
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.waitForURL('**/app');
    await page.getByRole('button', { name: 'Skip welcome guide' }).click();

    await page.goto('/app/profile');
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
    // The preview falls back to the handle rather than showing nothing.
    await expect(page.locator('.profile-preview .profile-card-name')).toContainText('@');
  });
});

test.describe('cookie consent', () => {
  test.beforeEach(async ({ request, context }) => {
    await resetBackend(request);
    await context.clearCookies();
  });

  test('shows once, and Accept makes the choice stick across a reload', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    const banner = page.locator('.cookie-consent');
    await expect(banner).toBeVisible();

    await banner.getByRole('button', { name: 'Accept' }).click();
    await expect(banner).toHaveCount(0);

    const stored = await page.evaluate(() => localStorage.getItem('focusflow-cookie-consent'));
    expect(stored).toBe('accepted');

    await page.reload();
    await expect(page.locator('.cookie-consent')).toHaveCount(0);
  });

  test('Decline also makes the choice stick, and is remembered as declined', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.locator('.cookie-consent').getByRole('button', { name: 'Decline analytics' }).click();
    await expect(page.locator('.cookie-consent')).toHaveCount(0);

    const stored = await page.evaluate(() => localStorage.getItem('focusflow-cookie-consent'));
    expect(stored).toBe('declined');

    await page.reload();
    await expect(page.locator('.cookie-consent')).toHaveCount(0);
  });

  test('the banner links to a real Privacy Policy page', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.locator('.cookie-consent').getByRole('link', { name: 'Privacy Policy' }).click();
    await page.waitForURL('**/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    // It should actually describe what the app does, not be a placeholder.
    // Exact match: both names also appear inside plain sentences elsewhere on
    // the page (e.g. "sent to OpenAI's API"), which would otherwise make
    // these resolve to more than one element.
    await expect(page.getByText('OpenAI', { exact: true })).toBeVisible();
    await expect(page.getByText('Supabase', { exact: true })).toBeVisible();
  });

  test('is reachable from the landing footer and the signup page', async ({ page }) => {
    await page.goto('/');
    // Scoped to the footer landmark — the still-open cookie banner has its
    // own "Privacy Policy" link too, and this test is specifically about the
    // footer's.
    await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy Policy' }).click();
    await page.waitForURL('**/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();

    await page.goto('/signup');
    // Scoped to the signup form's own legal line — the cookie banner (still
    // undismissed here too) carries a second "Privacy Policy" link.
    await expect(page.locator('.auth-legal').getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });
});
