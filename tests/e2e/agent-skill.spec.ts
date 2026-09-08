import { readFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import { makeSignature } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db'
import {
  attachments,
  conversations,
  generationRuns,
  messages,
  sessions,
  users,
} from '../../src/lib/db/schema'
import { env } from '../../src/lib/env.server'
import {
  deleteObject,
  putObject,
  type StoredObjectLocator,
} from '../../src/lib/r2/client'

test.use({ acceptDownloads: true })

const scopedUserId = () => `agent-skill-e2e-${test.info().project.name}`
const scopedEmail = (id: string) => `${id}@example.com`
const AGENT_SKILL_FIXTURE_MODEL_ID = 'agent-skill-e2e-model'
const AGENT_SKILL_FIXTURE_ROUTER_MODEL_ID = 'agent-skill-e2e-router-model'

const pendingR2Objects: StoredObjectLocator[] = []

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
    .values({ id: userId, email, name: 'Agent Skill E2E' })
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

test.afterEach(async () => {
  const objects = pendingR2Objects.splice(0)
  for (const locator of objects) {
    try {
      await deleteObject(locator)
    } catch {
      // best-effort cleanup of seeded R2 bytes
    }
  }
})

async function openSkillSelector(page: import('@playwright/test').Page) {
  const trigger = page.getByTestId('skill-selector-trigger')
  await expect(trigger).toBeVisible()
  await expect(async () => {
    await trigger.click()
    expect(await trigger.getAttribute('data-state')).toBe('open')
  }).toPass({ timeout: 10000 })
  await expect(page.getByTestId('skill-option-none')).toBeVisible()
}

async function openModelSelector(page: import('@playwright/test').Page) {
  const trigger = page.getByTestId('model-selector-trigger')
  await expect(trigger).toBeVisible()
  await expect(async () => {
    await trigger.click()
    expect(await trigger.getAttribute('data-state')).toBe('open')
  }).toPass({ timeout: 10000 })
  await expect(page.getByTestId('compare-switch')).toBeVisible()
}

test('compare mode blocks agent-skill submit with clear validation', async ({
  page,
}) => {
  const userId = scopedUserId()
  const [conversation] = await db
    .insert(conversations)
    .values({ userId, title: 'agent-skill guard thread' })
    .returning()

  await page.goto(`/chat/${conversation.id}`)
  await expect(page.getByTestId('message-list')).toBeVisible()
  await expect(page.getByTestId('skill-selector-trigger')).toBeEnabled()
  const trigger = page.getByTestId('skill-selector-trigger')
  const initialLabel = await trigger.innerText()

  await openModelSelector(page)
  await page.getByTestId('compare-switch').click()
  await expect(page.getByTestId('compare-switch')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(page.getByTestId('topbar-compare-label')).toBeVisible()
  await page.keyboard.press('Escape')

  await openSkillSelector(page)
  await expect(page.getByTestId('skill-option-agent-skill')).toBeDisabled()
  await expect(page.getByTestId('skill-option-prd-plan')).toBeDisabled()
  await expect(page.getByTestId('skill-option-none')).toBeEnabled()
  await expect(page.getByTestId('skill-option-checklist')).toBeEnabled()
  await page.keyboard.press('Escape')

  await openModelSelector(page)
  await page.getByTestId('compare-switch').click()
  await expect(page.getByTestId('compare-switch')).toHaveAttribute(
    'aria-checked',
    'false',
  )
  await page.keyboard.press('Escape')

  await openSkillSelector(page)
  await page.getByTestId('skill-option-agent-skill').click()
  await expect(page.getByTestId('skill-option-agent-skill')).toBeHidden()
  const selectedLabel = await trigger.innerText()
  expect(selectedLabel).not.toBe(initialLabel)

  await openModelSelector(page)
  await page.getByTestId('compare-switch').click()
  await expect(page.getByTestId('compare-switch')).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')

  expect(await trigger.innerText()).toBe(initialLabel)
  await openSkillSelector(page)
  await expect(page.getByTestId('skill-option-agent-skill')).toBeDisabled()
})

const SEEDED_MARKDOWN = `---
name: frontend-design
description: Seeded fixture for the agent-skill E2E download journey.
---

# Seeded Fixture

## When to Use

Seeded body section with enough substance to render a real file card.

## Process

First step, second step, third step of the seeded workflow.

## Verification Checklist

- [ ] Card renders before reload
- [ ] Card renders after reload
- [ ] Download matches seeded bytes
`

test('seeded artifact survives reload and downloads intact', async ({
  page,
}) => {
  const userId = scopedUserId()
  const fileName = 'frontend-design.md'
  const fileSize = Buffer.byteLength(SEEDED_MARKDOWN, 'utf8')
  const attachmentId = crypto.randomUUID()
  const r2Key = `users/${userId}/attachments/${attachmentId}/${fileName}`
  await putObject({
    bucket: env.R2_BUCKET_NAME,
    key: r2Key,
    body: Buffer.from(SEEDED_MARKDOWN, 'utf8'),
    contentType: 'text/markdown',
  })
  pendingR2Objects.push({ bucket: env.R2_BUCKET_NAME, key: r2Key })

  const [conversation] = await db
    .insert(conversations)
    .values({ userId, title: 'seeded artifact thread' })
    .returning()
  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      role: 'user',
      content: 'seeded artifact prompt',
    })
    .returning()
  void userMessage
  const [assistantMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      role: 'assistant',
      content: 'seeded artifact summary',
    })
    .returning()
  await db.insert(generationRuns).values({
    messageId: assistantMessage.id,
    conversationId: conversation.id,
    modelId: AGENT_SKILL_FIXTURE_MODEL_ID,
    routerModelId: AGENT_SKILL_FIXTURE_ROUTER_MODEL_ID,
    skillId: 'agent-skill',
    status: 'completed',
    content: null,
  })
  await db.insert(attachments).values({
    id: attachmentId,
    userId,
    conversationId: conversation.id,
    messageId: assistantMessage.id,
    fileName,
    fileSize,
    mimeType: 'text/markdown',
    r2Key,
    r2Bucket: env.R2_BUCKET_NAME,
    processingStatus: 'completed',
  })

  await page.goto(`/chat/${conversation.id}`)
  await expect(page.getByTestId('message-list')).toHaveAttribute(
    'data-message-count',
    '2',
  )
  await expect(page.getByTestId('artifact-file-card')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('message-list')).toHaveAttribute(
    'data-message-count',
    '2',
  )
  await expect(page.getByTestId('artifact-file-card')).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('artifact-download-btn').click(),
  ])
  expect(download.suggestedFilename()).toBe(fileName)
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('download path unavailable')
  const downloaded = await readFile(downloadPath, 'utf8')
  expect(downloaded).toBe(SEEDED_MARKDOWN)
})

test('failed generation shows recoverable error and no empty file', async ({
  page,
}) => {
  const userId = scopedUserId()
  const [conversation] = await db
    .insert(conversations)
    .values({ userId, title: 'failed artifact thread' })
    .returning()
  const [userMessage] = await db
    .insert(messages)
    .values({
      conversationId: conversation.id,
      role: 'user',
      content: 'failed artifact prompt',
    })
    .returning()
  void userMessage
  const [assistantMessage] = await db
    .insert(messages)
    .values({ conversationId: conversation.id, role: 'assistant', content: '' })
    .returning()
  await db.insert(generationRuns).values({
    messageId: assistantMessage.id,
    conversationId: conversation.id,
    modelId: AGENT_SKILL_FIXTURE_MODEL_ID,
    routerModelId: AGENT_SKILL_FIXTURE_ROUTER_MODEL_ID,
    skillId: 'agent-skill',
    status: 'failed',
    content: '',
    error: { message: 'seeded model failure', code: 'ERR-001' },
  })

  await page.goto(`/chat/${conversation.id}`)
  await expect(page.getByRole('note')).toBeVisible()
  await expect(page.getByTestId('artifact-file-card')).not.toBeAttached()
  await expect(page.getByTestId('composer-input')).toBeEnabled()

  await page.reload()
  await expect(page.getByRole('note')).toBeVisible()
  await expect(page.getByTestId('artifact-file-card')).not.toBeAttached()
  await expect(page.getByTestId('composer-input')).toBeEnabled()
})
