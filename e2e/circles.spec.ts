import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import {
  addPersonalTask,
  backendState,
  resetBackend,
  signUp,
  uniqueEmail,
} from './helpers';

/** A second signed-in browser, so two people can use one circle at once. */
async function newUserPage(browser: Browser, prefix: string): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(prefix);
  await signUp(page, email);
  return { page, email };
}

async function createCircle(page: Page, name: string) {
  await page.goto('/app/circles');
  await page.getByLabel('Circle name').fill(name);
  await page.getByRole('button', { name: 'Create circle' }).click();
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.waitForURL('**/app/circles/*');
  const code = await page.locator('.invite-code span').innerText();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  return code;
}

test.describe('circles: shared lists and shared streaks', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('two people share one list, and each sees the other’s work', async ({
    browser,
    request,
  }) => {
    const alice = await newUserPage(browser, 'alice');
    const bob = await newUserPage(browser, 'bob');

    const code = await createCircle(alice.page, 'Biology finals');

    // Bob joins with the code Alice shared.
    await bob.page.goto('/app/circles');
    await bob.page.getByLabel('Invite code').fill(code);
    await bob.page.getByRole('button', { name: 'Join' }).click();
    await bob.page.getByRole('link', { name: /Biology finals/ }).click();
    await bob.page.waitForURL('**/app/circles/*');

    // Alice adds a shared task; Bob sees it after a refresh.
    await alice.page.getByPlaceholder('Add something the whole circle can see').fill('Book the lab slot');
    await alice.page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(alice.page.getByText('Book the lab slot', { exact: true })).toBeVisible();

    await bob.page.getByRole('button', { name: 'Refresh' }).click();
    await expect(bob.page.getByText('Book the lab slot', { exact: true })).toBeVisible();

    // Bob ticks it off; the database credits Bob, not Alice.
    await bob.page.locator('.task-item', { hasText: 'Book the lab slot' }).locator('.task-check').click();

    await expect
      .poll(async () => {
        const state = await backendState(request);
        return state.tasks.find((task) => task.text === 'Book the lab slot')?.completed;
      })
      .toBe(true);

    const state = await backendState(request);
    const bobId = state.users.find((user) => user.email === bob.email)?.id;
    const aliceId = state.users.find((user) => user.email === alice.email)?.id;
    const shared = state.tasks.find((task) => task.text === 'Book the lab slot');

    expect(shared?.user_id).toBe(aliceId);
    expect(shared?.completed_by).toBe(bobId);
    expect(shared?.circle_id).toBeTruthy();

    // And Alice sees the finished task attributed to Bob.
    await alice.page.getByRole('button', { name: 'Refresh' }).click();
    await expect(
      alice.page.locator('.task-item.completed', { hasText: 'Book the lab slot' }),
    ).toBeVisible();
    await expect(alice.page.getByText(/done by/)).toBeVisible();

    await alice.page.context().close();
    await bob.page.context().close();
  });

  test('the streak board lists every member and counts today’s work', async ({
    browser,
    request,
  }) => {
    const alice = await newUserPage(browser, 'streaka');
    const bob = await newUserPage(browser, 'streakb');

    const code = await createCircle(alice.page, 'Gym crew');

    await bob.page.goto('/app/circles');
    await bob.page.getByLabel('Invite code').fill(code);
    await bob.page.getByRole('button', { name: 'Join' }).click();
    await bob.page.getByRole('link', { name: /Gym crew/ }).click();
    await bob.page.waitForURL('**/app/circles/*');

    // Bob finishes something of his own — that is what a streak counts.
    await addPersonalTask(bob.page, 'Morning run');
    await bob.page.locator('.task-item', { hasText: 'Morning run' }).locator('.task-check').click();

    await alice.page.getByRole('button', { name: 'Refresh' }).click();
    const board = alice.page.locator('.streak-board');
    await expect(board.locator('.streak-row')).toHaveCount(2);
    await expect(alice.page.getByText('(you)')).toBeVisible();

    const state = await backendState(request);
    const bobId = state.users.find((user) => user.email === bob.email)?.id;
    const bobHandle = state.profiles.find((profile) => profile.id === bobId)?.username;
    expect(bobHandle).toBeTruthy();

    const bobRow = board.locator('.streak-row', { hasText: `@${bobHandle}` });
    await expect(bobRow).toContainText('1 done today');
    await expect(bobRow.locator('.streak-count')).toContainText('1');

    await alice.page.context().close();
    await bob.page.context().close();
  });

  test('a private task is never exposed to the circle', async ({ browser }) => {
    const alice = await newUserPage(browser, 'privatea');
    const bob = await newUserPage(browser, 'privateb');

    const code = await createCircle(alice.page, 'Work squad');
    await addPersonalTask(alice.page, 'Salary negotiation notes');

    await bob.page.goto('/app/circles');
    await bob.page.getByLabel('Invite code').fill(code);
    await bob.page.getByRole('button', { name: 'Join' }).click();
    await bob.page.getByRole('link', { name: /Work squad/ }).click();
    await bob.page.waitForURL('**/app/circles/*');

    await expect(bob.page.getByText('Salary negotiation notes')).toHaveCount(0);
    await expect(bob.page.getByText('Nothing shared yet')).toBeVisible();

    // Bob's own list stays empty too.
    await bob.page.goto('/app/tasks');
    await expect(bob.page.getByText('Salary negotiation notes')).toHaveCount(0);

    await alice.page.context().close();
    await bob.page.context().close();
  });

  test('a wrong invite code is refused with a readable message', async ({ page }) => {
    await signUp(page, uniqueEmail('badcode'));
    await page.goto('/app/circles');
    await page.getByLabel('Invite code').fill('ZZZZZZ');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('alert')).toContainText('No circle uses the code ZZZZZZ');
  });

  test('leaving a circle removes it from your list but keeps your own tasks', async ({
    browser,
  }) => {
    const alice = await newUserPage(browser, 'leavea');
    const bob = await newUserPage(browser, 'leaveb');

    const code = await createCircle(alice.page, 'Study group');

    await bob.page.goto('/app/circles');
    await bob.page.getByLabel('Invite code').fill(code);
    await bob.page.getByRole('button', { name: 'Join' }).click();
    await addPersonalTask(bob.page, 'Keep this one');

    await bob.page.goto('/app/circles');
    await bob.page.getByRole('link', { name: /Study group/ }).click();
    await bob.page.getByRole('button', { name: 'Leave circle' }).click();
    await bob.page.getByRole('button', { name: 'Yes, leave' }).click();
    await bob.page.waitForURL('**/app/circles');

    await expect(bob.page.getByText('No circles yet')).toBeVisible();
    await bob.page.goto('/app/tasks');
    await expect(bob.page.getByText('Keep this one', { exact: true })).toBeVisible();

    await alice.page.context().close();
    await bob.page.context().close();
  });
});
