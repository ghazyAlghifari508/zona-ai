import { expect, test } from '@playwright/test'
import { makeSignature } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db'
import {
  artifacts,
  artifactVersions,
  attachments,
  comparisonRuns,
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

const scopedUserId = () => `compare-e2e-${test.info().project.name}`
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
    .values({ id: userId, email, name: 'Compare E2E' })
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
  const failedObjects: StoredObjectLocator[] = []
  for (const locator of objects) {
    try {
      await deleteObject(locator)
    } catch {
      failedObjects.push(locator)
    }
  }
  pendingR2Objects.push(...failedObjects)
  if (failedObjects.length > 0) {
    throw new Error(
      `Failed to clean up ${failedObjects.length} seeded R2 object(s)`,
    )
  }
})

const COMPARE_FIXTURE_MODELS = [
  {
    modelId: 'compare-e2e-model-1',
    routerModelId: 'compare-e2e-router-model-1',
  },
  {
    modelId: 'compare-e2e-model-2',
    routerModelId: 'compare-e2e-router-model-2',
  },
  {
    modelId: 'compare-e2e-model-3',
    routerModelId: 'compare-e2e-router-model-3',
  },
  {
    modelId: 'compare-e2e-model-4',
    routerModelId: 'compare-e2e-router-model-4',
  },
] as const

type SeededCompareArtifact = {
  artifactId: string
  title: string
  fileName: string
}

type CompareOutcome =
  | { type: 'artifact'; title: string; fileName: string; markdown: string }
  | { type: 'failed'; errorMessage: string }

async function seedUserMessage(input: {
  conversationId: string
  content: string
}) {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: 'user',
      content: input.content,
    })
    .returning()
  if (!message) throw new Error('compare user message fixture failed')
  return message
}

async function seedCompareConversation(input: {
  userId: string
  prompt: string
  modelIds: string[]
  status?: 'completed' | 'partial_failure'
}) {
  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: input.userId,
      title: 'compare e2e thread',
      mode: 'compare',
    })
    .returning()
  if (!conversation) throw new Error('conversation fixture failed')
  const userMessage = await seedUserMessage({
    conversationId: conversation.id,
    content: input.prompt,
  })
  const [comparisonRun] = await db
    .insert(comparisonRuns)
    .values({
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      status: input.status ?? 'completed',
      modelIds: input.modelIds,
    })
    .returning()
  if (!comparisonRun) throw new Error('comparison run fixture failed')
  return { conversation, comparisonRun, userMessage }
}

async function seedCompareGeneration(input: {
  conversationId: string
  comparisonRunId: string
  requestMessageId: string
  userId: string
  index: number
  baseTime: number
  modelId: string
  routerModelId: string
  outcome: CompareOutcome
}): Promise<SeededCompareArtifact | null> {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: 'assistant',
      content: '',
      createdAt: new Date(input.baseTime + (input.index + 1) * 1000),
    })
    .returning()
  if (!message) throw new Error('compare message fixture failed')

  const [generation] = await db
    .insert(generationRuns)
    .values({
      messageId: message.id,
      requestMessageId: input.requestMessageId,
      comparisonRunId: input.comparisonRunId,
      conversationId: input.conversationId,
      modelId: input.modelId,
      routerModelId: input.routerModelId,
      skillId: input.outcome.type === 'artifact' ? 'checklist' : 'none',
      status: input.outcome.type === 'artifact' ? 'completed' : 'failed',
      content: null,
      error:
        input.outcome.type === 'failed'
          ? { message: input.outcome.errorMessage, code: 'ERR-016' }
          : null,
    })
    .returning()
  if (!generation) throw new Error('compare generation fixture failed')

  if (input.outcome.type === 'failed') return null

  const attachmentId = crypto.randomUUID()
  const r2Key = `users/${input.userId}/compare/${input.comparisonRunId}/${input.outcome.fileName}`
  await putObject({
    bucket: env.R2_BUCKET_NAME,
    key: r2Key,
    body: Buffer.from(input.outcome.markdown, 'utf8'),
    contentType: 'text/markdown',
  })
  pendingR2Objects.push({ bucket: env.R2_BUCKET_NAME, key: r2Key })

  const [attachment] = await db
    .insert(attachments)
    .values({
      id: attachmentId,
      userId: input.userId,
      conversationId: input.conversationId,
      messageId: message.id,
      fileName: input.outcome.fileName,
      fileSize: Buffer.byteLength(input.outcome.markdown, 'utf8'),
      mimeType: 'text/markdown',
      r2Key,
      r2Bucket: env.R2_BUCKET_NAME,
      processingStatus: 'completed',
    })
    .returning()
  if (!attachment) throw new Error('compare attachment fixture failed')

  const [artifact] = await db
    .insert(artifacts)
    .values({
      userId: input.userId,
      conversationId: input.conversationId,
      kind: 'checklist',
      title: input.outcome.title,
    })
    .returning()
  if (!artifact) throw new Error('compare artifact fixture failed')

  const [version] = await db
    .insert(artifactVersions)
    .values({
      artifactId: artifact.id,
      conversationId: input.conversationId,
      version: 1,
      attachmentId: attachment.id,
      generationRunId: generation.id,
      title: input.outcome.title,
      createdByModelId: input.modelId,
      createdByRouterModelId: input.routerModelId,
      changeSummary: 'Created artifact',
    })
    .returning()
  if (!version) throw new Error('compare version fixture failed')

  await db
    .update(artifacts)
    .set({ currentVersionId: version.id })
    .where(eq(artifacts.id, artifact.id))

  return {
    artifactId: artifact.id,
    title: input.outcome.title,
    fileName: input.outcome.fileName,
  }
}

function compareMarkdown(label: string): string {
  const ordinal = label.toLowerCase()
  return `# Seeded Compare ${label}\n\nSeeded compare ${ordinal} artifact body for grid verification.\n`
}

function desktopOnly() {
  test.skip(
    test.info().project.name !== 'chromium',
    'desktop-only compare journey',
  )
}

async function openCompareArtifactCard(
  page: import('@playwright/test').Page,
  artifact: SeededCompareArtifact,
) {
  const card = page
    .getByTestId('artifact-file-card')
    .filter({ hasText: artifact.fileName })
  await expect(card).toBeVisible()
  await card.getByRole('button').click()
  await expect(page.getByTestId('artifact-header-title')).toHaveText(
    artifact.title,
  )
  await expect(
    page
      .getByTestId('artifact-preview')
      .getByRole('heading', { name: artifact.title }),
  ).toBeVisible()
}

test('compare selector toggles multi-model contract on a real route', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const [conversation] = await db
    .insert(conversations)
    .values({ userId, title: 'compare toggle thread' })
    .returning()
  if (!conversation) throw new Error('conversation fixture failed')

  await page.goto(`/chat/${conversation.id}`)
  await expect(page.getByTestId('message-list')).toBeVisible()
  await expect(page.getByTestId('model-selector-trigger')).toBeEnabled()

  const trigger = page.getByTestId('model-selector-trigger')
  await expect(async () => {
    await trigger.click()
    expect(await trigger.getAttribute('data-state')).toBe('open')
  }).toPass({ timeout: 10_000 })
  const compareSwitch = page.getByTestId('compare-switch')
  await expect(compareSwitch).toBeVisible()
  await compareSwitch.click()
  await expect(compareSwitch).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('topbar-compare-label')).toBeVisible()
  await page.keyboard.press('Escape')

  await expect(async () => {
    await trigger.click()
    expect(await trigger.getAttribute('data-state')).toBe('open')
  }).toPass({ timeout: 10_000 })
  await compareSwitch.click()
  await expect(compareSwitch).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByTestId('topbar-compare-label')).toBeHidden()
})

test('compare exposes four independent successful artifact cards', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const prompt = 'Seeded compare prompt for the four artifact journey.'
  const { conversation, comparisonRun, userMessage } =
    await seedCompareConversation({
      userId,
      prompt,
      modelIds: COMPARE_FIXTURE_MODELS.map(({ modelId }) => modelId),
    })
  const labels = ['One', 'Two', 'Three', 'Four']
  const base = Date.now()
  const seededArtifacts: SeededCompareArtifact[] = []
  for (const [index, label] of labels.entries()) {
    const seeded = await seedCompareGeneration({
      conversationId: conversation.id,
      comparisonRunId: comparisonRun.id,
      requestMessageId: userMessage.id,
      userId,
      index,
      baseTime: base,
      modelId: COMPARE_FIXTURE_MODELS[index].modelId,
      routerModelId: COMPARE_FIXTURE_MODELS[index].routerModelId,
      outcome: {
        type: 'artifact',
        title: `Seeded Compare ${label}`,
        fileName: `compare-${label.toLowerCase()}.md`,
        markdown: compareMarkdown(label),
      },
    })
    if (seeded) seededArtifacts.push(seeded)
  }
  if (seededArtifacts.length !== labels.length) {
    throw new Error('compare artifact fixtures failed')
  }

  await page.goto(`/chat/${conversation.id}`)
  const grid = page.getByTestId('compare-grid')
  await expect(grid).toBeVisible()
  for (const artifact of seededArtifacts) {
    await openCompareArtifactCard(page, artifact)
  }

  await page.reload()
  await expect(page.getByTestId('compare-grid')).toBeVisible()

  const openAll = page.getByTestId('compare-open-all')
  await expect(openAll).toBeVisible()
  await openAll.click()
  const tabs = page.getByTestId('artifact-tabs').getByRole('tab')
  await expect(tabs).toHaveCount(4)
  await expect(page.getByRole('tab', { selected: true })).toHaveCount(1)

  for (const artifact of seededArtifacts) {
    await page.getByTestId(`artifact-tab-${artifact.artifactId}`).click()
    await expect(page.getByTestId('artifact-header-title')).toHaveText(
      artifact.title,
    )
    await expect(
      page
        .getByTestId('artifact-preview')
        .getByRole('heading', { name: artifact.title }),
    ).toBeVisible()
  }

  await page.getByTestId('artifact-close-panel').click()
  await expect(page.getByTestId('artifact-canvas')).toBeHidden()

  await page.reload()
  await expect(page.getByTestId('compare-grid')).toBeVisible()
  for (const artifact of seededArtifacts) {
    await expect(
      page
        .getByTestId('artifact-file-card')
        .filter({ hasText: artifact.fileName }),
    ).toBeVisible()
  }
})

test('one failed compare generation leaves successful siblings openable', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const prompt = 'Seeded compare prompt for the failed sibling journey.'
  const { conversation, comparisonRun, userMessage } =
    await seedCompareConversation({
      userId,
      prompt,
      modelIds: COMPARE_FIXTURE_MODELS.map(({ modelId }) => modelId),
      status: 'partial_failure',
    })
  const base = Date.now()
  const seededArtifacts: SeededCompareArtifact[] = []
  const outcomes: Array<{ label: string; outcome: CompareOutcome }> = [
    {
      label: 'One',
      outcome: {
        type: 'artifact',
        title: 'Seeded Compare One',
        fileName: 'compare-one.md',
        markdown: compareMarkdown('One'),
      },
    },
    {
      label: 'Two',
      outcome: { type: 'failed', errorMessage: 'Seeded compare failure' },
    },
    {
      label: 'Three',
      outcome: {
        type: 'artifact',
        title: 'Seeded Compare Three',
        fileName: 'compare-three.md',
        markdown: compareMarkdown('Three'),
      },
    },
    {
      label: 'Four',
      outcome: {
        type: 'artifact',
        title: 'Seeded Compare Four',
        fileName: 'compare-four.md',
        markdown: compareMarkdown('Four'),
      },
    },
  ]
  for (const [index, spec] of outcomes.entries()) {
    const model = COMPARE_FIXTURE_MODELS[index]
    if (!model) throw new Error('compare model fixture failed')
    const seeded = await seedCompareGeneration({
      conversationId: conversation.id,
      comparisonRunId: comparisonRun.id,
      requestMessageId: userMessage.id,
      userId,
      index,
      baseTime: base,
      modelId: model.modelId,
      routerModelId: model.routerModelId,
      outcome: spec.outcome,
    })
    if (seeded) seededArtifacts.push(seeded)
  }
  if (seededArtifacts.length !== 3) {
    throw new Error('compare artifact fixtures failed')
  }

  await page.goto(`/chat/${conversation.id}`)
  const grid = page.getByTestId('compare-grid')
  await expect(grid).toBeVisible()
  await expect(page.getByRole('note')).toHaveCount(1)
  for (const artifact of seededArtifacts) {
    await openCompareArtifactCard(page, artifact)
  }

  await page.reload()
  await expect(page.getByTestId('compare-grid')).toBeVisible()
  await expect(page.getByRole('note')).toHaveCount(1)

  const openAll = page.getByTestId('compare-open-all')
  await expect(openAll).toBeVisible()
  await openAll.click()
  const tabs = page.getByTestId('artifact-tabs').getByRole('tab')
  await expect(tabs).toHaveCount(3)

  for (const artifact of seededArtifacts) {
    await page.getByTestId(`artifact-tab-${artifact.artifactId}`).click()
    await expect(page.getByTestId('artifact-header-title')).toHaveText(
      artifact.title,
    )
    await expect(
      page
        .getByTestId('artifact-preview')
        .getByRole('heading', { name: artifact.title }),
    ).toBeVisible()
  }

  const lastArtifact = seededArtifacts[seededArtifacts.length - 1]
  const previousArtifact = seededArtifacts[seededArtifacts.length - 2]
  if (!lastArtifact || !previousArtifact) {
    throw new Error('compare artifact fixtures failed')
  }
  await page
    .getByTestId(`artifact-header-close-${lastArtifact.artifactId}`)
    .click()
  await expect(page.getByTestId('artifact-header-title')).toHaveText(
    previousArtifact.title,
  )
  await page.getByTestId('artifact-close-panel').click()
  await expect(page.getByTestId('artifact-canvas')).toBeHidden()
})
