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

const userId = 'phase-04-e2e-user'
const email = 'phase-04-e2e@example.com'

async function clearConversations() {
  await db.delete(conversations).where(eq(conversations.userId, userId))
}

test.beforeAll(async () => {
  await db.delete(users).where(eq(users.id, userId))
})

test.afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId))
})

test.beforeEach(async ({ context }) => {
  await clearConversations()
  const authContext = await auth.$context
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

test('empty state creates a persistent conversation', async ({ page }) => {
  await page.goto('/chat')
  await expect(page.getByText('Belum ada percakapan')).toBeVisible()
  await page.getByRole('button', { name: 'New Chat' }).click()
  await expect(page).toHaveURL(/\/chat\/[a-f0-9-]+/)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'New Chat' })).toBeVisible()
})

test('searches, renames, archives, and deletes conversations', async ({
  page,
}) => {
  await db.insert(conversations).values([
    { userId, title: 'Alpha project' },
    { userId, title: 'Beta project' },
  ])
  await page.goto('/chat')

  await page.getByRole('searchbox', { name: 'Cari percakapan' }).fill('Alpha')
  await expect(page.getByText('Alpha project')).toBeVisible()
  await expect(page.getByText('Beta project')).not.toBeVisible()

  await page.getByRole('button', { name: 'Menu Alpha project' }).click()
  await page.getByRole('menuitem', { name: 'Rename' }).click()
  const rename = page.getByRole('textbox', { name: 'Rename Alpha project' })
  await rename.fill('Renamed project')
  await rename.press('Enter')
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
  await expect(page.getByRole('heading', { name: 'Long thread' })).toBeVisible()
  await expect(page.locator('[data-index]')).toHaveCount(13)
  expect(await page.locator('[data-index]').count()).toBeLessThan(50)
  await page.reload()
  await expect(page.locator('[data-index]').first()).toBeVisible()
})
