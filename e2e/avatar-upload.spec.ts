import { test, expect } from '@playwright/test';
import { AVATAR_FIXTURE, AVATAR_FIXTURE_2, backendState, resetBackend, signUp, uniqueEmail } from './helpers';

test.describe('a real photo, not just an emoji', () => {
  test.beforeEach(async ({ request }) => {
    await resetBackend(request);
  });

  test('uploads, shows on your own card, and shows on the public link', async ({
    page,
    request,
  }) => {
    await signUp(page, uniqueEmail('shutterbug'));
    await page.goto('/app/profile');

    await page.getByLabel('Upload a profile photo').setInputFiles(AVATAR_FIXTURE);
    // The preview swaps from the emoji glyph to a real <img> once it lands.
    const previewImg = page.locator('.avatar-preview img');
    await expect(previewImg).toBeVisible();
    await expect(page.getByRole('button', { name: 'Change photo' })).toBeVisible();

    const uploadedSrc = await previewImg.getAttribute('src');
    expect(uploadedSrc).toBeTruthy();

    await page.getByLabel('Username').fill('shutterbug_' + Date.now().toString(36).slice(-6));
    const handle = await page.getByLabel('Username').inputValue();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Saved')).toBeVisible();

    await expect
      .poll(async () => (await backendState(request)).profiles[0]?.avatar_url)
      .toBe(uploadedSrc);

    // A stranger following the public link gets the same real photo — not a
    // broken image, and not the emoji fallback.
    const visitorContext = await page.context().browser()!.newContext();
    const visitor = await visitorContext.newPage();
    await visitor.goto(`/u/${handle}`);

    const publicImg = visitor.locator('.profile-card .profile-avatar img');
    await expect(publicImg).toHaveAttribute('src', uploadedSrc!);
    await expect(publicImg).toHaveJSProperty('complete', true);
    const naturalWidth = await publicImg.evaluate((img: HTMLImageElement) => img.naturalWidth);
    expect(naturalWidth).toBeGreaterThan(0); // a broken <img> reports 0

    await visitorContext.close();
  });

  test('replacing the photo changes the card, and removing it falls back to the emoji', async ({
    page,
  }) => {
    await signUp(page, uniqueEmail('changeable'));
    await page.goto('/app/profile');

    await page.getByLabel('Upload a profile photo').setInputFiles(AVATAR_FIXTURE);
    await expect(page.locator('.avatar-preview img')).toBeVisible();
    const firstSrc = await page.locator('.avatar-preview img').getAttribute('src');

    await page.getByLabel('Upload a profile photo').setInputFiles(AVATAR_FIXTURE_2);
    await expect
      .poll(() => page.locator('.avatar-preview img').getAttribute('src'))
      .not.toBe(firstSrc);

    await page.getByRole('button', { name: 'Use emoji instead' }).click();
    await expect(page.locator('.avatar-preview img')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
  });

  test('a non-image file is refused before anything is sent', async ({ page, request }) => {
    await signUp(page, uniqueEmail('wrongtype'));
    await page.goto('/app/profile');

    await page.getByLabel('Upload a profile photo').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('this is not a photo'),
    });

    await expect(page.getByRole('alert')).toContainText('JPG, PNG, WEBP, or GIF');
    expect((await backendState(request)).profiles[0]?.avatar_url).toBeNull();
  });

  test('an oversized file is refused before anything is sent', async ({ page, request }) => {
    await signUp(page, uniqueEmail('toobig'));
    await page.goto('/app/profile');

    await page.getByLabel('Upload a profile photo').setInputFiles({
      name: 'huge.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(5 * 1024 * 1024), // 5MB — over the 4MB limit
    });

    await expect(page.getByRole('alert')).toContainText('too big');
    expect((await backendState(request)).profiles[0]?.avatar_url).toBeNull();
  });
});
