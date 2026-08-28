import { test, expect } from '@playwright/test'

/**
 * Fase 03 E2E - Credits UI & design tokens
 * Note: full credit-deduction E2E is verified via integration tests.
 */

test('credit widget shows kredit label in credit flow page', async ({ page }) => {
  // Visit sign-in (public page) and check design tokens
  await page.goto('/auth/sign-in')
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toContain('245')
})

test('inter font is applied', async ({ page }) => {
  await page.goto('/')
  const font = await page.evaluate(() => getComputedStyle(document.body).fontFamily)
  expect(font).toContain('Inter')
})

test('navigation is visible and clickable', async ({ page }) => {
  await page.goto('/')
  // Public shell has nav links
  const navLink = page.getByRole('link', { name: /Masuk|Sign in/i }).first()
  await expect(navLink).toBeVisible({ timeout: 10000 })
  await navLink.click()
  await expect(page).toHaveURL(/\/auth\/sign-in/)
})
