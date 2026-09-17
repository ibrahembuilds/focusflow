import { test, expect } from '@playwright/test';
import {
  addPersonalTask,
  backendState,
  dismissOnboarding,
  logIn,
  logOut,
  resetBackend,
  signUp,
  uniqueEmail,
} from './helpers';

test.describe('tasks belong to the account, not the browser', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('a new task reaches the signed-in user in the database', async ({ page, request }) => {
    const email = uniqueEmail('saver');
    await signUp(page, email);
    await addPersonalTask(page, 'Write the lab report');

    await expect
      .poll(async () => (await backendState(request)).tasks.map((task) => task.text))
      .toContain('Write the lab report');

    const state = await backendState(request);
    const account = state.users.find((user) => user.email === email);
    const saved = state.tasks.find((task) => task.text === 'Write the lab report');

    expect(account).toBeDefined();
    expect(saved?.user_id).toBe(account?.id);
    // A personal task carries no circle, so it stays out of every shared list.
    expect(saved?.circle_id).toBeNull();
  });

  test('the task comes back on a device that has never seen it', async ({ page, request }) => {
    const email = uniqueEmail('rehydrate');
    await signUp(page, email);
    await addPersonalTask(page, 'Revise chapter four');
    await expect
      .poll(async () => (await backendState(request)).tasks.length)
      .toBeGreaterThan(0);

    // Wipe every trace of this browser: the cached store, the write queue, and
    // the auth session. Anything that survives came back from the account.
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.context().clearCookies();

    await logIn(page, email);
    await page.goto('/app/tasks');
    await expect(page.getByText('Revise chapter four', { exact: true })).toBeVisible();
  });

  test('completing a task is saved too, and survives a reload', async ({ page, request }) => {
    const email = uniqueEmail('completer');
    await signUp(page, email);
    await addPersonalTask(page, 'Send the invoice');

    const row = page.locator('.task-item', { hasText: 'Send the invoice' });
    await row.locator('.task-check').click();

    await expect
      .poll(async () => (await backendState(request)).tasks[0]?.completed)
      .toBe(true);

    await page.reload();
    await dismissOnboarding(page);
    await expect(
      page.locator('.task-item.completed', { hasText: 'Send the invoice' }),
    ).toBeVisible();
  });

  test('one account never sees another account’s tasks', async ({ page, request }) => {
    const first = uniqueEmail('owner');
    await signUp(page, first);
    await addPersonalTask(page, 'Private budget review');
    await expect.poll(async () => (await backendState(request)).tasks.length).toBe(1);

    await logOut(page);

    const second = uniqueEmail('stranger');
    await signUp(page, second);
    await page.goto('/app/tasks');

    await expect(page.getByText('Private budget review')).toHaveCount(0);
    await expect(page.getByText('No tasks for today')).toBeVisible();
  });
});
