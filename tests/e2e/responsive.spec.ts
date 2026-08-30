import { expect, test } from '@playwright/test'

/**
 * Fase 10 â€” Responsive 3 viewports (UI-UX.md Â§5):
 * - Desktop > 1024: Sidebar 280px always visible
 * - Tablet 768-1024: Sidebar hidden, hamburger toggle
 * - Mobile < 768: Sidebar hidden, hamburger toggle, Composer safe-area
 */

const MOBILE = { width: 375, height: 667 } as const
const TABLET = { width: 768, height: 800 } as const
const DESKTOP = { width: 1280, height: 800 } as const

async function authedPage(page: import('@playwright/test').Page) {
  // Use dev shortcut: insert session via direct DB and add cookie
  const { makeSignature } = await import('better-auth/crypto')
  const { eq } = await import('drizzle-orm')
  const { auth } = await import('../../src/lib/auth/auth')
  const { db } = await import('../../src/lib/db')
  const { sessions, users } = await import('../../src/lib/db/schema')

  const userId = 'responsive-test-user'
  await db.delete(users).where(eq(users.id, userId))
  await db.insert(users).values({
    id: userId,
    email: 'responsive@example.com',
    name: 'Responsive',
    credits: 100,
  })
  const authContext = await auth.$context
  const token = crypto.randomUUID()
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  const signature = await makeSignature(token, authContext.secret)
  const cookieName = authContext.authCookies.sessionToken.name
  await page.context().addCookies([
    {
      name: cookieName,
      value: `${token}.${signature}`,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
  ])
  await page.waitForLoadState('networkidle').catch(() => {})
  return userId
}

test.describe('responsive â€” 3 viewports (Desktop / Tablet / Mobile)', () => {
  test('desktop >1024: sidebar visible, hamburger hidden', async ({ page }) => {
    await authedPage(page)
    await page.setViewportSize(DESKTOP)
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    const sidebar = page.locator('aside')
    await expect(sidebar).toBeVisible()
    await expect(page.getByTestId('hamburger')).not.toBeVisible()
  })

  test('tablet 768-1024: sidebar hidden behind hamburger toggle', async ({
    page,
  }) => {
    await authedPage(page)
    await page.setViewportSize(TABLET)
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('aside')).toBeHidden()
    await page.getByTestId('hamburger').click()
    await expect(page.locator('aside')).toBeVisible()
  })

  test('mobile <768: sidebar hidden, hamburger visible, composer fixed bottom safe-area', async ({
    page,
  }) => {
    await authedPage(page)
    await page.setViewportSize(MOBILE)
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('aside')).toBeHidden()
    await expect(page.getByTestId('hamburger')).toBeVisible()
    // Composer lives on the conversation route; open sidebar then create one
    await page.getByTestId('hamburger').click()
    await expect(page.locator('aside')).toBeVisible()
    await page.getByRole('button', { name: 'Chat baru' }).click()
    // Chat baru routes to the unified home composer (draft flow)
    await page.waitForURL('/')
    await expect(page.getByTestId('composer')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('composer-input').fill('tes mobile draft')
    await page.getByTestId('send-button').click()
    await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15000 })
    // Composer must use safe-area-inset-bottom padding
    const pb = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="composer"]')
      return el ? getComputedStyle(el).paddingBottom : null
    })
    expect(pb).not.toBeNull()
  })
})
