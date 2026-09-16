import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { addPersonalTask, backendState, resetBackend, signUp, uniqueEmail } from './helpers';

async function completeATask(page: Page, text: string) {
  await addPersonalTask(page, text);
  await page.locator('.task-item', { hasText: text }).locator('.task-check').click();
  await expect(page.locator('.task-item.completed', { hasText: text })).toBeVisible();
}

/** Someone who is not signed in, following a link they were sent. */
async function visitorPage(browser: Browser) {
  const context = await browser.newContext();
  return context.newPage();
}

async function setUpProfile(
  page: Page,
  values: { handle: string; name: string; bio: string; emoji?: string },
) {
  await page.goto('/app/profile');
  await page.getByLabel('Name', { exact: true }).fill(values.name);
  await page.getByLabel('Username').fill(values.handle);
  await page.getByLabel('Bio').fill(values.bio);
  if (values.emoji) {
    await page.getByRole('button', { name: `Use ${values.emoji} as your profile emoji` }).click();
  }
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Saved')).toBeVisible();
}

test.describe('a profile you can share', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('you build a card, and the preview is what a friend actually gets', async ({
    browser,
    page,
  }) => {
    await signUp(page, uniqueEmail('sharer'));
    await completeATask(page, 'Finish the reading');

    await setUpProfile(page, {
      handle: 'maya_reads',
      name: 'Maya',
      bio: 'Second-year biology. Trying to read before midnight.',
      emoji: '📚',
    });

    // The preview alongside the editor shows the real card.
    const preview = page.locator('.profile-preview .profile-card');
    await expect(preview.getByRole('heading', { name: 'Maya' })).toBeVisible();
    await expect(preview).toContainText('@maya_reads');
    await expect(preview).toContainText('Trying to read before midnight');

    // And the link is offered, ready to send.
    await expect(page.locator('.profile-share-link code')).toHaveText(/\/u\/maya_reads$/);

    // A stranger with the link sees the same card.
    const visitor = await visitorPage(browser);
    await visitor.goto('/u/maya_reads');

    await expect(visitor.getByRole('heading', { name: 'Maya' })).toBeVisible();
    await expect(visitor.getByText('@maya_reads')).toBeVisible();
    await expect(visitor.getByText('Trying to read before midnight')).toBeVisible();
    await expect(visitor.locator('.profile-card')).toContainText('📚');
    // Signed out, so they are invited to join.
    await expect(visitor.getByRole('link', { name: 'Start free' })).toBeVisible();

    await visitor.context().close();
  });

  test('the shared numbers are real, and never the tasks behind them', async ({
    browser,
    page,
  }) => {
    await signUp(page, uniqueEmail('numbers'));
    await completeATask(page, 'Top secret client brief');
    await setUpProfile(page, { handle: 'sam_works', name: 'Sam', bio: 'Shipping things.' });

    const visitor = await visitorPage(browser);
    await visitor.goto('/u/sam_works');

    const card = visitor.locator('.profile-card');
    await expect(card).toContainText('Streak');
    await expect(card).toContainText('Finished');
    await expect(card).toContainText('Focused');
    // One finished task today: one-day streak, one task.
    await expect(card.locator('.profile-stat', { hasText: 'Streak' })).toContainText('1');
    await expect(card.locator('.profile-stat', { hasText: 'Finished' })).toContainText('1');

    // The number is shared. The task is not.
    await expect(visitor.getByText('Top secret client brief')).toHaveCount(0);
    expect(await visitor.content()).not.toContain('Top secret client brief');

    await visitor.context().close();
  });

  test('switching a number off removes it from the shared card', async ({ browser, page }) => {
    await signUp(page, uniqueEmail('picky'));
    await completeATask(page, 'Morning pages');
    await setUpProfile(page, { handle: 'quiet_one', name: 'Robin', bio: 'Low key.' });

    await page.getByRole('checkbox', { name: /Show my streak/ }).uncheck();
    await page.getByRole('checkbox', { name: /Show focus time/ }).uncheck();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Saved')).toBeVisible();

    const visitor = await visitorPage(browser);
    await visitor.goto('/u/quiet_one');

    const card = visitor.locator('.profile-card');
    await expect(card.getByRole('heading', { name: 'Robin' })).toBeVisible();
    await expect(card).toContainText('Finished');
    await expect(card).not.toContainText('Streak');
    await expect(card).not.toContainText('Focused');
    await expect(visitor.locator('.profile-activity')).toHaveCount(0);

    await visitor.context().close();
  });

  test('turning the profile off closes the link for everyone', async ({
    browser,
    page,
    request,
  }) => {
    await signUp(page, uniqueEmail('private'));
    await setUpProfile(page, { handle: 'ghost_mode', name: 'Alex', bio: 'Here and not here.' });

    const visitor = await visitorPage(browser);
    await visitor.goto('/u/ghost_mode');
    await expect(visitor.getByRole('heading', { name: 'Alex' })).toBeVisible();

    await page.getByRole('checkbox', { name: /Share my profile/ }).uncheck();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Saved')).toBeVisible();
    // With sharing off there is no link to hand out.
    await expect(page.locator('.profile-share-link')).toHaveCount(0);

    await expect
      .poll(async () => (await backendState(request)).profiles[0]?.is_public)
      .toBe(false);

    await visitor.reload();
    await expect(visitor.getByText('Nothing to see here')).toBeVisible();
    await expect(visitor.getByRole('heading', { name: 'Alex' })).toHaveCount(0);

    await visitor.context().close();
  });

  test('a day you showed up stands out from an empty one, in both themes', async ({
    browser,
    page,
  }) => {
    await signUp(page, uniqueEmail('heatmap'));
    await completeATask(page, 'Showed up today');
    await setUpProfile(page, { handle: 'grid_check', name: 'Sky', bio: 'Testing the grid.' });

    const visitor = await visitorPage(browser);

    for (const theme of ['light', 'dark'] as const) {
      await visitor.emulateMedia({ colorScheme: theme });
      await visitor.goto(`/u/grid_check`);
      await visitor.evaluate((value) => {
        document.documentElement.dataset.theme = value;
      }, theme);

      const days = visitor.locator('.profile-activity-day');
      await expect(days).toHaveCount(30);

      const colourOf = (selector: string) =>
        visitor
          .locator(selector)
          .first()
          .evaluate((node) => getComputedStyle(node).backgroundColor);

      const active = await colourOf('.profile-activity-day.on');
      const empty = await colourOf('.profile-activity-day:not(.on)');

      // A CSS override that out-specifies `.on` paints today grey and the
      // streak silently disappears, which no other assertion would notice.
      expect(active, `active day should be visible in ${theme} mode`).not.toBe(empty);
    }

    await visitor.context().close();
  });

  test('a handle nobody owns looks exactly like a private one', async ({ browser }) => {
    const visitor = await visitorPage(browser);
    await visitor.goto('/u/nobody_here');
    await expect(visitor.getByText('Nothing to see here')).toBeVisible();
    await expect(visitor.getByText('@nobody_here')).toBeVisible();
    await visitor.context().close();
  });

  test('you can open a circle mate’s profile from the streak board', async ({ browser }) => {
    const aliceContext = await browser.newContext();
    const alice = await aliceContext.newPage();
    await signUp(alice, uniqueEmail('boarda'));

    const bobContext = await browser.newContext();
    const bob = await bobContext.newPage();
    await signUp(bob, uniqueEmail('boardb'));
    await setUpProfile(bob, {
      handle: 'bob_studies',
      name: 'Bob',
      bio: 'Chemistry, mostly.',
      emoji: '🔥',
    });

    // Alice starts a circle and Bob joins it.
    await alice.goto('/app/circles');
    await alice.getByLabel('Circle name').fill('Lab partners');
    await alice.getByRole('button', { name: 'Create circle' }).click();
    await alice.getByRole('link', { name: /Lab partners/ }).click();
    await alice.waitForURL('**/app/circles/*');
    const code = await alice.locator('.invite-code span').innerText();

    await bob.goto('/app/circles');
    await bob.getByLabel('Invite code').fill(code);
    await bob.getByRole('button', { name: 'Join' }).click();
    await expect(bob.getByRole('link', { name: /Lab partners/ })).toBeVisible();

    await alice.getByRole('button', { name: 'Refresh' }).click();
    const bobRow = alice.locator('.streak-row', { hasText: '@bob_studies' });
    await expect(bobRow).toContainText('🔥');

    await bobRow.getByRole('link', { name: /Bob/ }).click();
    await alice.waitForURL('**/u/bob_studies');
    await expect(alice.getByRole('heading', { name: 'Bob' })).toBeVisible();
    await expect(alice.getByText('Chemistry, mostly.')).toBeVisible();
    // Signed in, so no sign-up pitch.
    await expect(alice.getByRole('link', { name: 'Start free' })).toHaveCount(0);

    await aliceContext.close();
    await bobContext.close();
  });
});
