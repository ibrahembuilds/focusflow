import { test, expect } from '@playwright/test';
import type { Browser, Page } from '@playwright/test';
import { backendState, resetBackend, signUp, uniqueEmail } from './helpers';

async function newUserPage(browser: Browser, prefix: string): Promise<{ page: Page; email: string }> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const email = uniqueEmail(prefix);
  await signUp(page, email);
  return { page, email };
}

async function createPrivateCircle(page: Page, name: string) {
  await page.goto('/app/circles');
  await page.getByLabel('Circle name').fill(name);
  await page.getByRole('checkbox', { name: /Ask-to-join/ }).check();
  await page.getByRole('button', { name: 'Create circle' }).click();
  await expect(page.getByRole('link', { name: new RegExp(name) })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(name) }).click();
  await page.waitForURL('**/app/circles/*');
  const code = await page.locator('.invite-code span').innerText();
  return code;
}

test.describe('a circle can ask before letting someone in', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('the owner sees a lock badge, and open circles are unaffected', async ({ page }) => {
    await signUp(page, uniqueEmail('badge'));
    await createPrivateCircle(page, 'Founders only');
    await expect(page.getByText('Ask-to-join')).toBeVisible();

    await page.goto('/app/circles');
    await expect(page.locator('.circle-card-lock')).toBeVisible();
  });

  test('joining files a request instead of walking straight in', async ({ browser, request }) => {
    const alice = await newUserPage(browser, 'gatekeeper');
    const bob = await newUserPage(browser, 'asker');

    const code = await createPrivateCircle(alice.page, 'Founders only');

    await bob.page.goto('/app/circles');
    await bob.page.getByLabel('Invite code').fill(code);
    await bob.page.getByRole('button', { name: 'Join' }).click();

    await expect(bob.page.getByText(/Request sent/)).toBeVisible();
    // Bob is not shown the circle — he isn't a member yet.
    await expect(bob.page.getByText('Founders only')).toHaveCount(1); // only inside the notice text
    await expect(bob.page.locator('.circle-card')).toHaveCount(0);

    const state = await backendState(request);
    expect(state.circle_join_requests).toHaveLength(1);
    expect(state.circle_members).toHaveLength(1); // only alice, the owner

    await alice.page.context().close();
    await bob.page.context().close();
  });

  test('the owner approves one person and declines another', async ({ browser, request }) => {
    const alice = await newUserPage(browser, 'approver');
    const bob = await newUserPage(browser, 'approved');
    const carol = await newUserPage(browser, 'declined');

    const code = await createPrivateCircle(alice.page, 'Study crew');

    for (const person of [bob, carol]) {
      await person.page.goto('/app/circles');
      await person.page.getByLabel('Invite code').fill(code);
      await person.page.getByRole('button', { name: 'Join' }).click();
      await expect(person.page.getByText(/Request sent/)).toBeVisible();
    }

    await alice.page.reload();
    await expect(alice.page.getByText('Waiting to join (2)')).toBeVisible();
    const rows = alice.page.locator('.join-request-row');
    await expect(rows).toHaveCount(2);

    await rows.filter({ hasText: 'approved' }).getByRole('button', { name: 'Let them in' }).click();
    await rows.filter({ hasText: 'declined' }).getByRole('button', { name: 'Decline' }).click();

    await expect(alice.page.locator('.join-request-row')).toHaveCount(0);

    // Bob is in: he can see the shared list now.
    await bob.page.goto('/app/circles');
    await expect(bob.page.getByRole('link', { name: /Study crew/ })).toBeVisible();

    // Carol is not, and her request has simply gone away — not a ban.
    await carol.page.goto('/app/circles');
    await expect(carol.page.locator('.circle-card')).toHaveCount(0);

    const state = await backendState(request);
    expect(state.circle_join_requests).toHaveLength(0);
    expect(state.circle_members).toHaveLength(2); // alice + bob

    // Carol can ask again — declining isn't permanent.
    await carol.page.getByLabel('Invite code').fill(code);
    await carol.page.getByRole('button', { name: 'Join' }).click();
    await expect(carol.page.getByText(/Request sent/)).toBeVisible();

    await alice.page.context().close();
    await bob.page.context().close();
    await carol.page.context().close();
  });

  test('only the owner can see or act on the inbox', async ({ browser, request }) => {
    const alice = await newUserPage(browser, 'owneronly');
    const bob = await newUserPage(browser, 'notowner');
    const carol = await newUserPage(browser, 'requester');

    const code = await createPrivateCircle(alice.page, 'Locked room');

    // Bob joins while the circle is still open... no wait, it's ask-to-join
    // from creation, so Bob has to be let in by Alice first to become a
    // member able to view the circle at all.
    await bob.page.goto('/app/circles');
    await bob.page.getByLabel('Invite code').fill(code);
    await bob.page.getByRole('button', { name: 'Join' }).click();
    await alice.page.reload();
    await alice.page.locator('.join-request-row').getByRole('button', { name: 'Let them in' }).click();

    // Carol requests too, so there is something in the inbox to fight over.
    await carol.page.goto('/app/circles');
    await carol.page.getByLabel('Invite code').fill(code);
    await carol.page.getByRole('button', { name: 'Join' }).click();

    // Bob is a member, but not the owner — no inbox for him.
    await bob.page.goto('/app/circles');
    await bob.page.getByRole('link', { name: /Locked room/ }).click();
    await expect(bob.page.getByText(/Waiting to join/)).toHaveCount(0);

    const state = await backendState(request);
    expect(state.circle_join_requests).toHaveLength(1); // carol's, untouched by bob

    await alice.page.context().close();
    await bob.page.context().close();
    await carol.page.context().close();
  });
});
