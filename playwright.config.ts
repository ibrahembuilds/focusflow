import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the production bundle in a real browser against
 * `e2e/fake-supabase.mjs`, a stand-in for the Supabase auth and PostgREST APIs.
 * Everything above the network boundary — routing, the store, the offline write
 * queue, row-level access rules — is the code that ships.
 */
const SUPABASE_PORT = 54331;
const APP_PORT = 4173;

export const SUPABASE_URL = `http://127.0.0.1:${SUPABASE_PORT}`;
export const APP_URL = `http://127.0.0.1:${APP_PORT}`;

// Any structurally valid JWT works here: the fake backend identifies the caller
// from the access token it issued, and never inspects the anon key.
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJmYWtlLXN1cGFiYXNlIiwicm9sZSI6ImFub24iLCJpYXQiOjAsImV4cCI6NDEwMjQ0NDgwMH0.ZmFrZS1zaWduYXR1cmU';

export default defineConfig({
  testDir: './e2e',
  // One in-memory backend is shared by every spec, so they run in sequence.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Use Playwright's own Chromium by default. Set PLAYWRIGHT_CHROMIUM_PATH
        // when the browser lives somewhere else (a CI image that ships one, a
        // sandbox that forbids `playwright install`).
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: [
    {
      command: 'node e2e/fake-supabase.mjs',
      url: `${SUPABASE_URL}/__test/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `npm run build && npx vite preview --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
      url: APP_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      env: {
        VITE_SUPABASE_URL: SUPABASE_URL,
        VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
      },
    },
  ],
});
