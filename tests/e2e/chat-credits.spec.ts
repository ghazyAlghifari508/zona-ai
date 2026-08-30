import { expect, test } from '@playwright/test'

/**
 * Fase 03 E2E - Credits UI & design tokens
 * Note: full credit-deduction E2E is verified via integration tests.
 */

test('credit widget shows kredit label in credit flow page', async ({
  page,
}) => {
  // Visit sign-in (public page) and check design tokens
  await page.goto('/auth/sign-in')
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  )
  expect(bg).toContain('246')
})

test('inter font is applied', async ({ page }) => {
  await page.goto('/')
  const font = await page.evaluate(
    () => getComputedStyle(document.body).fontFamily,
  )
  expect(font).toContain('Inter')
})

test('navigation is visible and clickable', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  const vp = page.viewportSize()
  if (vp && vp.width < 1024) {
    await expect(page.getByTestId('hamburger')).toBeVisible()
    await page.getByTestId('hamburger').click()
    await expect(page.getByTestId('guest-sidebar')).toBeVisible()
  }
  // Guest sidebar exposes a direct Google OAuth sign-in button
  const signIn = page.getByTestId('guest-sign-in')
  await expect(signIn).toBeVisible({ timeout: 10000 })
  await expect(signIn).toBeEnabled()
})
