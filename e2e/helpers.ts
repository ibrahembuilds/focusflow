import { expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { SUPABASE_URL } from '../playwright.config';

export interface BackendState {
  users: { id: string; email: string }[];
  profiles: { id: string; username: string; display_name: string | null }[];
  circles: { id: string; name: string; owner_id: string; invite_code: string }[];
  circle_members: { circle_id: string; user_id: string; role: string }[];
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
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/app');
  await dismissOnboarding(page);
}

export async function logIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/app');
  await dismissOnboarding(page);
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
