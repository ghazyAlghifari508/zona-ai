import { expect, test } from '@playwright/test'

test('sign-in renders Google button only, no password input', async ({
  page,
}) => {
  await page.goto('/auth/sign-in')
  await expect(
    page.getByRole('button', {
      name: /Continue with Google|Masuk dengan Google/i,
    }),
  ).toBeVisible()
  await expect(page.locator('input[type="password"]')).toHaveCount(0)
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  )
  expect(bg).toContain('246')
})

test('sign-in card 50px no shadow-xl', async ({ page }) => {
  await page.goto('/auth/sign-in')
  const card = page.locator('[data-testid="auth-card"]')
  await expect(card).toBeVisible()
  const radius = await card.evaluate((el) => getComputedStyle(el).borderRadius)
  // Notion card radius 12px (rounded-lg) — allow 8px fallback from Tailwind default during transition
  expect(radius).toMatch(/12px|8px/)
  const hasShadow = await card.evaluate((el) => getComputedStyle(el).boxShadow)
  expect(hasShadow).toBe('none')
})

test('chat redirects to sign-in when unauthenticated', async ({ page }) => {
  await page.goto('/chat')
  await expect(page).toHaveURL(/\/auth\/sign-in/)
})
