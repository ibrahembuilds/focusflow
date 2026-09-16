import { test, expect } from '@playwright/test';
import { backendState, resetBackend, signUp, uniqueEmail } from './helpers';

test.describe('every account has a username', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('a new account is given a handle straight away', async ({ page, request }) => {
    const email = uniqueEmail('handle');
    await signUp(page, email);

    const state = await backendState(request);
    const account = state.users.find((user) => user.email === email);
    const profile = state.profiles.find((item) => item.id === account?.id);

    expect(profile?.username).toMatch(/^[a-z0-9_]{3,20}$/);

    await page.goto('/app/settings');
    await expect(page.getByLabel('Username')).toHaveValue(profile!.username);
  });

  test('you can rename your handle and it sticks', async ({ page, request }) => {
    await signUp(page, uniqueEmail('rename'));
    await page.goto('/app/settings');

    await page.getByLabel('Name', { exact: true }).fill('Ibrahem');
    await page.getByLabel('Username').fill('ibrahem_builds');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Saved')).toBeVisible();

    await expect
      .poll(async () => (await backendState(request)).profiles.map((p) => p.username))
      .toContain('ibrahem_builds');

    await page.goto('/app/circles');
    await expect(page.getByText('@ibrahem_builds')).toBeVisible();
  });

  test('a handle someone already owns is refused', async ({ page }) => {
    await signUp(page, uniqueEmail('first'));
    await page.goto('/app/settings');
    await page.getByLabel('Username').fill('takenhandle');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Saved')).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForURL((url) => !url.pathname.startsWith('/app'));

    await signUp(page, uniqueEmail('second'));
    await page.goto('/app/settings');
    await page.getByLabel('Username').fill('takenhandle');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('alert')).toContainText('@takenhandle is already taken.');
  });

  test('an invalid handle is rejected before it is sent', async ({ page }) => {
    await signUp(page, uniqueEmail('invalid'));
    await page.goto('/app/settings');
    await page.getByLabel('Username').fill('ab');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByRole('alert')).toContainText('at least 3 characters');
  });
});
