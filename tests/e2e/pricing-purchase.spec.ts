import { expect, test } from '@playwright/test'

test.describe('pricing purchase (guest)', () => {
  test('renders all three plan cards', async ({ page }) => {
    await page.goto('/pricing')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('plan-card-free')).toBeVisible()
    await expect(page.getByTestId('plan-card-pro')).toBeVisible()
    await expect(page.getByTestId('plan-card-ultra')).toBeVisible()
    await expect(page.getByTestId('plan-button-free')).toBeDisabled()
  })

  test('guest purchase attempt redirects to sign-in', async ({ page }) => {
    await page.goto('/pricing')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('plan-button-pro').click()
    await expect(page).toHaveURL(/\/auth\/sign-in/)
  })
})
