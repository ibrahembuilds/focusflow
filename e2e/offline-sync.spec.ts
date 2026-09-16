import { test, expect } from '@playwright/test';
import { backendState, resetBackend, signUp, uniqueEmail } from './helpers';

test.describe('a dropped connection never loses a task', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('a task added while the network is down still reaches the account', async ({
    page,
    request,
  }) => {
    await signUp(page, uniqueEmail('offline'));
    await page.goto('/app/tasks');

    // Cut the database off. Auth keeps working, exactly like a flaky connection
    // that drops one request rather than the whole session.
    await page.route('**/rest/v1/**', (route) => route.abort('failed'));

    await page.getByPlaceholder('What do you want to accomplish?').fill('Pay the deposit');
    await page.getByRole('button', { name: 'Add', exact: true }).click();

    // The task is on screen, and the app says plainly that it has not saved yet.
    await expect(page.getByText('Pay the deposit', { exact: true })).toBeVisible();
    await expect(page.locator('.sync-banner')).toContainText('waiting to reach your account');
    expect((await backendState(request)).tasks).toHaveLength(0);

    // Reconnect and retry.
    await page.unroute('**/rest/v1/**');
    await page.getByRole('button', { name: 'Retry now' }).click();

    await expect(page.locator('.sync-banner')).toHaveCount(0);
    await expect
      .poll(async () => (await backendState(request)).tasks.map((task) => task.text))
      .toContain('Pay the deposit');
  });

  test('a queued task survives a full page reload', async ({ page, request }) => {
    const email = uniqueEmail('queued');
    await signUp(page, email);
    await page.goto('/app/tasks');

    await page.route('**/rest/v1/**', (route) => route.abort('failed'));
    await page.getByPlaceholder('What do you want to accomplish?').fill('Renew the passport');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.locator('.sync-banner')).toBeVisible();

    // Reload with the network still down: the queue lives in localStorage.
    await page.reload();
    await expect(page.getByText('Renew the passport', { exact: true })).toBeVisible();

    await page.unroute('**/rest/v1/**');
    await page.getByRole('button', { name: 'Retry now' }).click();

    await expect
      .poll(async () => (await backendState(request)).tasks.map((task) => task.text))
      .toContain('Renew the passport');
  });
});
