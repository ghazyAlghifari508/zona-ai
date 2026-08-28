import { test, expect } from '@playwright/test'

test('sign-in renders Google button only, no password input', async ({ page }) => {
  await page.goto('/auth/sign-in')
  await expect(page.getByRole('button', { name: /Continue with Google|Masuk dengan Google/i })).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toContain('245')
})

test('sign-in card 50px no shadow-xl', async ({ page }) => {
  await page.goto('/auth/sign-in')
  const card = page.locator('[data-testid="auth-card"]')
  await expect(card).toBeVisible()
  const radius = await card.evaluate((el) => getComputedStyle(el).borderRadius)
  expect(radius).toContain('50px')
})

test('chat redirects to sign-in when unauthenticated', async ({ page }) => {
  await page.goto('/chat')
  await expect(page).toHaveURL(/\/auth\/sign-in/)
})
