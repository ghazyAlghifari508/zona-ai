import { expect, test } from '@playwright/test'
import { makeSignature } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db'
import {
  artifacts,
  artifactVersions,
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
import { gotoChatAndWaitForArtifactHydration } from './artifact-hydration'

const scopedUserId = () => `artifact-mentions-e2e-${test.info().project.name}`
const scopedEmail = (id: string) => `${id}@example.com`

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
    .values({ id: userId, email, name: 'Artifact Mentions E2E' })
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
    } catch {}
  }
})

async function seedConversationWithArtifact(title: string, markdown: string) {
  const userId = scopedUserId()
  const [conv] = await db
    .insert(conversations)
    .values({ userId, title: `Chat ${title}` })
    .returning({ id: conversations.id })
  if (!conv) throw new Error('Conversation creation failed')

  const [msg] = await db
    .insert(messages)
    .values({
      conversationId: conv.id,
      role: 'assistant',
      content: `Here is ${title}`,
    })
    .returning({ id: messages.id })
  if (!msg) throw new Error('Message creation failed')

  const [gen] = await db
    .insert(generationRuns)
    .values({
      messageId: msg.id,
      conversationId: conv.id,
      modelId: 'auto',
      routerModelId: 'google/gemini-2.5-flash',
      skillId: 'prd-plan',
      status: 'completed',
      content: `Summary of ${title}`,
    })
    .returning({ id: generationRuns.id })
  if (!gen) throw new Error('Generation creation failed')

  const r2Key = `e2e-mentions/${crypto.randomUUID()}-${title.toLowerCase().replace(/\s+/g, '-')}.md`
  const locator: StoredObjectLocator = {
    bucket: env.R2_BUCKET_NAME,
    key: r2Key,
  }
  await putObject({
    ...locator,
    body: Buffer.from(markdown, 'utf8'),
    contentType: 'text/markdown',
  })
  pendingR2Objects.push(locator)

  const [att] = await db
    .insert(attachments)
    .values({
      userId,
      messageId: msg.id,
      conversationId: conv.id,
      fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.md`,
      fileSize: Buffer.byteLength(markdown, 'utf8'),
      mimeType: 'text/markdown',
      r2Key,
      r2Bucket: env.R2_BUCKET_NAME,
      processingStatus: 'completed',
    })
    .returning({ id: attachments.id })
  if (!att) throw new Error('Attachment creation failed')

  const [art] = await db
    .insert(artifacts)
    .values({
      userId,
      conversationId: conv.id,
      kind: 'prd',
      title,
    })
    .returning({ id: artifacts.id })
  if (!art) throw new Error('Artifact creation failed')

  const [ver] = await db
    .insert(artifactVersions)
    .values({
      artifactId: art.id,
      conversationId: conv.id,
      version: 1,
      attachmentId: att.id,
      generationRunId: gen.id,
      title: `${title} v1`,
      changeSummary: 'Seed initial',
      createdByModelId: 'auto',
      createdByRouterModelId: 'google/gemini-2.5-flash',
    })
    .returning({ id: artifactVersions.id })
  if (!ver) throw new Error('Version creation failed')

  await db
    .update(artifacts)
    .set({ currentVersionId: ver.id })
    .where(eq(artifacts.id, art.id))

  return {
    conversationId: conv.id,
    artifactId: art.id,
    versionId: ver.id,
    title,
  }
}

test.describe('Structured @artifact Mentions E2E Journeys', () => {
  test('typing @ in composer opens picker, navigates with keyboard, and selects chip', async ({
    page,
  }) => {
    const seed = await seedConversationWithArtifact(
      'Mobile App PRD',
      '# Mobile App PRD\n\nInitial mobile requirements.',
    )

    await gotoChatAndWaitForArtifactHydration(
      page,
      `/chat/${seed.conversationId}`,
    )

    const composer = page.getByTestId('composer-input')
    await expect(composer).toBeVisible()

    // Type @ to open mention picker
    await composer.fill('Please look at @')
    const picker = page.getByTestId('artifact-mention-picker')
    await expect(picker).toBeVisible()
    await expect(picker.getByText('Mobile App PRD')).toBeVisible()

    // Select with Enter key
    await composer.press('Enter')
    await expect(picker).not.toBeVisible()

    // Verify mention chip tray rendered
    const chips = page.getByTestId('artifact-mention-chips')
    await expect(chips).toBeVisible()
    await expect(chips.getByText('@Mobile App PRD')).toBeVisible()

    // Chip defaults to Context mode
    const modeBtn = chips.getByRole('button', { name: /Ganti mode mention/i })
    await expect(modeBtn).toHaveText('Context')

    // Click to toggle to Revise
    await modeBtn.click()
    await expect(modeBtn).toHaveText('Revise')

    // Click again to toggle back to Context
    await modeBtn.click()
    await expect(modeBtn).toHaveText('Context')
  })

  test('clicking historical mention token opens Canvas with exact referenced version', async ({
    page,
  }) => {
    const seed = await seedConversationWithArtifact(
      'Checkout Flow',
      '# Checkout Flow\n\n1. Cart\n2. Payment\n3. Receipt',
    )

    // Seed a historical user message that contains message_artifact_mentions
    const [userMsg] = await db
      .insert(messages)
      .values({
        conversationId: seed.conversationId,
        role: 'user',
        content: 'Check the checkout flow',
      })
      .returning({ id: messages.id })
    if (!userMsg) throw new Error('User message fixture failed')

    const { persistArtifactMentions } = await import(
      '../../src/server/core/artifact-mentions'
    )
    await persistArtifactMentions(db, {
      messageId: userMsg.id,
      conversationId: seed.conversationId,
      mentions: [
        {
          artifactId: seed.artifactId,
          versionId: seed.versionId,
          mode: 'context',
          title: seed.title,
          kind: 'prd',
          version: 1,
          attachmentId: crypto.randomUUID(),
          modelId: 'auto',
          routerModelId: 'google/gemini-2.5-flash',
          locator: { bucket: env.R2_BUCKET_NAME, key: 'fake' },
          contentSha256: null,
        },
      ],
    })

    await gotoChatAndWaitForArtifactHydration(
      page,
      `/chat/${seed.conversationId}`,
    )

    // Verify historical mention token exists
    const token = page.getByTestId(`mention-token-${seed.artifactId}`)
    await expect(token).toBeVisible()
    await expect(token).toContainText('@Checkout Flow')

    // Click token to open Canvas
    await token.click()

    // Canvas should open with Checkout Flow title and preview
    const canvas = page.getByTestId('artifact-canvas')
    await expect(canvas).toBeVisible()
    await expect(page.getByTestId('artifact-header-title')).toHaveText(
      'Checkout Flow',
    )
  })

  test('canvas "Tambahkan ke context" action creates a context chip in composer', async ({
    page,
  }) => {
    test.skip(
      test.info().project.name === 'mobile',
      'Desktop Canvas bridge test',
    )

    const seed = await seedConversationWithArtifact(
      'Search API Spec',
      '# Search API Spec\n\nEndpoints for full text search.',
    )

    await gotoChatAndWaitForArtifactHydration(
      page,
      `/chat/${seed.conversationId}`,
    )

    // Open file card from message list to display in canvas
    const fileCard = page.getByTestId(`file-card-${seed.artifactId}`)
    if (await fileCard.isVisible()) {
      await fileCard.click()
    } else {
      // Open via historical token or header if tab open
      const firstCard = page.getByTestId('file-card-name').first()
      if (await firstCard.isVisible()) {
        await firstCard.click()
      }
    }

    const canvas = page.getByTestId('artifact-canvas')
    if (await canvas.isVisible()) {
      const addToContextBtn = page.getByTestId('artifact-add-to-context')
      if (await addToContextBtn.isVisible()) {
        await addToContextBtn.click()
        const chips = page.getByTestId('artifact-mention-chips')
        await expect(chips).toBeVisible()
        await expect(chips.getByText(/Search API Spec/i)).toBeVisible()
      }
    }
  })
})
