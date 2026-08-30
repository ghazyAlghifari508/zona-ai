import { expect, test } from '@playwright/test'

/**
 * Fase 10 — E2E 12 Critical Paths (docs/TESTING.md §4)
 *
 * Coverage map (existing suites + this spec):
 *  1. Register/Login (Google OAuth UI) ........ tests/e2e/auth.spec.ts
 *  2. Create conversation (New Chat) .......... tests/e2e/persistence.spec.ts
 *  3. Single streaming message ................ tests/e2e/websearch.spec.ts + rag.spec.ts
 *  4. Stop generation ......................... tests/integration/chat.test.ts (stopGenerationCore)
 *  5. Regenerate response ..................... tests/integration/chat.test.ts (retryGenerationCore)
 *  6. Compare parallel (2+ models) ............ tests/e2e/compare.spec.ts
 *  7. Compare partial failure + retry ......... tests/e2e/compare.spec.ts
 *  8. Reload persistence ...................... tests/e2e/persistence.spec.ts + websearch.spec.ts
 *  9. Upload file (R2 + validation) ........... tests/e2e/upload.spec.ts
 * 10. RAG indexing + retrieval ................ tests/e2e/rag.spec.ts
 * 11. Web search citations (Tavily) ........... tests/e2e/websearch.spec.ts
 * 12. Logout (session cleared) ................ THIS SPEC
 */

test.describe('critical path 12 — logout', () => {
  test('sign out clears session and redirects to sign-in', async ({ page }) => {
    // Seed an authenticated session
    const { makeSignature } = await import('better-auth/crypto')
    const { eq } = await import('drizzle-orm')
    const { auth } = await import('../../src/lib/auth/auth')
    const { db } = await import('../../src/lib/db')
    const { sessions, users } = await import('../../src/lib/db/schema')

    const userId = 'logout-e2e-user'
    await db.delete(users).where(eq(users.id, userId))
    await db.insert(users).values({
      id: userId,
      email: 'logout-e2e@example.com',
      name: 'Logout E2E',
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
    await page.context().addCookies([
      {
        name: authContext.authCookies.sessionToken.name,
        value: `${token}.${signature}`,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
    ])

    await page.goto('/chat')
    await page.waitForLoadState('networkidle')
    const vp = page.viewportSize()
    if (vp && vp.width < 1024) {
      await page.getByTestId('hamburger').click()
      await expect(page.locator('aside')).toBeVisible()
    } else {
      await expect(page.locator('aside')).toBeVisible()
    }

    // Act: sign out from sidebar
    await page.getByRole('button', { name: 'Keluar' }).click()

    // Assert: redirected to sign-in; /chat now redirects unauthenticated
    await page.waitForURL(/\/auth\/sign-in/, { timeout: 15000 })
    await page.goto('/chat')
    await page.waitForURL(/\/auth\/sign-in/, { timeout: 15000 })
    await db.delete(users).where(eq(users.id, userId))
  })
})
