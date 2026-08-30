import { expect, test } from '@playwright/test'
import { makeSignature } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db'
import {
  conversations,
  messages,
  sessions,
  users,
} from '../../src/lib/db/schema'

const scopedUserId = () => `phase-04-e2e-${test.info().project.name}`
const scopedEmail = (id: string) => `${id}@example.com`

async function clearConversations() {
  await db.delete(conversations).where(eq(conversations.userId, scopedUserId()))
}

test.beforeAll(async () => {
  await db.delete(users).where(eq(users.id, scopedUserId()))
})

test.afterAll(async () => {
  await db.delete(users).where(eq(users.id, scopedUserId()))
})

test.beforeEach(async ({ context }) => {
  await clearConversations()
  const authContext = await auth.$context
  const userId = scopedUserId()
  const email = scopedEmail(userId)
  await db
    .insert(users)
    .values({ id: userId, email, name: 'Phase 04 E2E' })
    .onConflictDoNothing()
  const token = crypto.randomUUID()
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  })
  const signature = await makeSignature(token, authContext.secret)
  const cookie = `${authContext.authCookies.sessionToken.name}=${token}.${signature}`
  const session = await auth.api.getSession({
    headers: new Headers({ cookie }),
  })
  expect(session?.user.id).toBe(userId)
  await context.addCookies([
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
})

async function ensureSidebarVisible(page: import('@playwright/test').Page) {
  const vp = page.viewportSize()
  if (vp && vp.width < 1024) {
    await page.waitForLoadState('networkidle')
    const hamburger = page.getByTestId('hamburger')
    await expect(hamburger).toBeVisible({ timeout: 5000 })
    await hamburger.click()
    await expect(page.locator('aside')).toBeVisible({ timeout: 5000 })
  }
}

test('empty state creates a persistent conversation', async ({ page }) => {
  await page.goto('/chat')
  await ensureSidebarVisible(page)
  await expect(page.getByText('Belum ada percakapan')).toBeVisible()
  // Chat baru now routes to the unified home composer; the conversation is
  // created when the first message is sent (draft flow)
  await page.getByRole('button', { name: 'Chat baru' }).click()
  await expect(page).toHaveURL('/')
  await page.getByTestId('composer-input').fill('halo tes persistensi')
  await page.getByTestId('send-button').click()
  await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/, { timeout: 15000 })
  await page.reload()
  await expect(page.locator('[data-testid="message-list"]')).toBeVisible()
})

test('searches, renames, archives, and deletes conversations', async ({
  page,
}) => {
  const userId = scopedUserId()
  await db.insert(conversations).values([
    { userId, title: 'Alpha project' },
    { userId, title: 'Beta project' },
  ])
  await page.goto('/chat')
  await page.waitForLoadState('networkidle')
  await ensureSidebarVisible(page)

  await page.getByRole('searchbox', { name: 'Cari percakapan' }).fill('Alpha')
  await expect(page.getByText('Alpha project')).toBeVisible()
  await expect(page.getByText('Beta project')).not.toBeVisible()

  await page.getByRole('button', { name: 'Menu Alpha project' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const rename = page.getByRole('textbox', { name: 'Rename Alpha project' })
  await rename.fill('Renamed project')
  await rename.press('Enter')
  // Clear the search filter so the renamed item is no longer filtered out
  await page.getByRole('searchbox', { name: 'Cari percakapan' }).fill('')
  await expect(page.getByText('Renamed project')).toBeVisible()

  await page.getByRole('button', { name: 'Menu Renamed project' }).click()
  await page.getByRole('menuitem', { name: 'Archive' }).click()
  await expect(page.getByText('Renamed project')).not.toBeVisible()

  await page.getByRole('searchbox', { name: 'Cari percakapan' }).fill('Beta')
  await page.getByRole('button', { name: 'Menu Beta project' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Hapus percakapan' }).click()
  await expect(page.getByText('Beta project')).not.toBeVisible()
})

test('reload restores messages and virtualizes a long thread', async ({
  page,
}) => {
  const userId = scopedUserId()
  const [conversation] = await db
    .insert(conversations)
    .values({ userId, title: 'Long thread' })
    .returning()
  await db.insert(messages).values(
    Array.from({ length: 150 }, (_, index) => ({
      conversationId: conversation.id,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `Persisted message ${index}`,
      createdAt: new Date(Date.UTC(2026, 7, 29, 0, 0, index)),
    })),
  )

  await page.goto(`/chat/${conversation.id}`)
  await ensureSidebarVisible(page)
  await expect(page.getByText('Long thread').first()).toBeVisible()
  const initialCount = await page.locator('[data-index]').count()
  expect(initialCount).toBeGreaterThan(8)
  expect(initialCount).toBeLessThan(50)
  expect(initialCount).not.toBe(150)
  await page.reload()
  // After reload sidebar may be hidden again on mobile
  await ensureSidebarVisible(page)
  await expect(page.locator('[data-index]').first()).toBeVisible()
})
