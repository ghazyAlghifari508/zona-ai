import { expect, test } from '@playwright/test'

/**
 * Fase 03 E2E - UI rendering & streaming display
 * Note: full streaming/auth E2E is verified via integration tests.
 * These tests focus on UI component presence, routing, and design tokens.
 */

test('home page has cream background', async ({ page }) => {
  await page.goto('/')
  const bg = await page.evaluate(
    () => getComputedStyle(document.body).backgroundColor,
  )
  // cream #f5f1e4 = rgb(245, 241, 228)
  expect(bg).toContain('245')
})

test('chat route exists and renders without server error', async ({ page }) => {
  const response = await page.goto('/chat')
  expect(response?.status()).toBeLessThan(500)
})

test('sign-in route renders', async ({ page }) => {
  const response = await page.goto('/auth/sign-in')
  expect(response?.status()).toBeLessThan(500)
  await expect(page.getByRole('button', { name: /Google/i })).toBeVisible()
})

test('no shadow-xl classes in rendered HTML', async ({ page }) => {
  await page.goto('/')
  const hasShadowXl = await page.evaluate(() => {
    const all = document.querySelectorAll('*')
    for (const el of Array.from(all)) {
      const cls = el.className
      if (
        typeof cls === 'string' &&
        cls.split(' ').some((c) => c.match(/shadow-(lg|xl|2xl)/))
      ) {
        return el.outerHTML.slice(0, 200)
      }
    }
    return null
  })
  expect(hasShadowXl).toBeNull()
})
