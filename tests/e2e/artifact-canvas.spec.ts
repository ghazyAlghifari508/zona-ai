import { readFile } from 'node:fs/promises'
import {
  type Download,
  expect,
  type Locator,
  type Page,
  test,
} from '@playwright/test'
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
import {
  gotoChatAndWaitForArtifactHydration,
  reloadAndWaitForArtifactHydration,
} from './artifact-hydration'

test.use({ acceptDownloads: true })

const scopedUserId = () => `artifact-canvas-e2e-${test.info().project.name}`
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
    .values({ id: userId, email, name: 'Artifact Canvas E2E' })
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

const SKILL_ID_BY_KIND = {
  prd: 'prd-plan',
  'agent-skill': 'agent-skill',
  checklist: 'checklist',
} as const

const ARTIFACT_FIXTURE_MODEL_ID = 'artifact-canvas-e2e-model'
const ARTIFACT_FIXTURE_ROUTER_MODEL_ID = 'artifact-canvas-e2e-router-model'

type ArtifactKind = keyof typeof SKILL_ID_BY_KIND

type SeededArtifactVersion = {
  versionId: string
  attachmentId: string
  fileName: string
  markdown: string
}

type SeededArtifact = {
  artifactId: string
  title: string
  versions: SeededArtifactVersion[]
}

async function seedConversation(input: {
  userId: string
  title: string
  mode?: 'normal' | 'compare'
}) {
  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: input.userId,
      title: input.title,
      mode: input.mode ?? 'normal',
    })
    .returning()
  if (!conversation) throw new Error('conversation fixture failed')
  return conversation
}

async function seedArtifactWithVersions(input: {
  userId: string
  conversationId: string
  kind: ArtifactKind
  title: string
  versions: Array<{ fileName: string; markdown: string; changeSummary: string }>
  createdAtBase: number
}): Promise<SeededArtifact> {
  const [artifact] = await db
    .insert(artifacts)
    .values({
      userId: input.userId,
      conversationId: input.conversationId,
      kind: input.kind,
      title: input.title,
    })
    .returning()
  if (!artifact) throw new Error('artifact fixture failed')

  const versions: SeededArtifactVersion[] = []
  for (const [index, spec] of input.versions.entries()) {
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: input.conversationId,
        role: 'assistant',
        content: `${input.title} ready.`,
        createdAt: new Date(input.createdAtBase + (index + 1) * 1000),
      })
      .returning()
    if (!message) throw new Error('artifact message fixture failed')

    const previous = versions[index - 1] ?? null
    const [generation] = await db
      .insert(generationRuns)
      .values({
        messageId: message.id,
        conversationId: input.conversationId,
        modelId: ARTIFACT_FIXTURE_MODEL_ID,
        routerModelId: ARTIFACT_FIXTURE_ROUTER_MODEL_ID,
        skillId: SKILL_ID_BY_KIND[input.kind],
        status: 'completed',
        content: null,
        ...(previous
          ? {
              sourceArtifactId: artifact.id,
              sourceVersionId: previous.versionId,
            }
          : {}),
      })
      .returning()
    if (!generation) throw new Error('generation fixture failed')

    const attachmentId = crypto.randomUUID()
    const r2Key = `users/${input.userId}/artifacts/${artifact.id}/${spec.fileName}`
    await putObject({
      bucket: env.R2_BUCKET_NAME,
      key: r2Key,
      body: Buffer.from(spec.markdown, 'utf8'),
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
        fileName: spec.fileName,
        fileSize: Buffer.byteLength(spec.markdown, 'utf8'),
        mimeType: 'text/markdown',
        r2Key,
        r2Bucket: env.R2_BUCKET_NAME,
        processingStatus: 'completed',
      })
      .returning()
    if (!attachment) throw new Error('attachment fixture failed')

    const [version] = await db
      .insert(artifactVersions)
      .values({
        artifactId: artifact.id,
        conversationId: input.conversationId,
        version: index + 1,
        sourceVersionId: previous?.versionId ?? null,
        attachmentId: attachment.id,
        generationRunId: generation.id,
        title: input.title,
        createdByModelId: ARTIFACT_FIXTURE_MODEL_ID,
        createdByRouterModelId: ARTIFACT_FIXTURE_ROUTER_MODEL_ID,
        changeSummary: spec.changeSummary,
      })
      .returning()
    if (!version) throw new Error('artifact version fixture failed')

    versions.push({
      versionId: version.id,
      attachmentId: attachment.id,
      fileName: spec.fileName,
      markdown: spec.markdown,
    })
  }

  const current = versions[versions.length - 1]
  if (!current) throw new Error('artifact fixture failed')
  await db
    .update(artifacts)
    .set({ currentVersionId: current.versionId })
    .where(eq(artifacts.id, artifact.id))
  return { artifactId: artifact.id, title: input.title, versions }
}

function fileCard(page: Page, fileName: string): Locator {
  return page.getByTestId('artifact-file-card').filter({ hasText: fileName })
}

async function openArtifactCard(page: Page, fileName: string) {
  const card = fileCard(page, fileName)
  await expect(card).toBeVisible()
  await card.getByRole('button').click()
  await expect(page.getByTestId('artifact-canvas')).toBeVisible()
}

async function downloadFrom(page: Page, locator: Locator) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    locator.click(),
  ])
  const downloadPath = await download.path()
  if (!downloadPath) throw new Error('download path unavailable')
  const bytes = await readFile(downloadPath)
  return { download, bytes }
}

function desktopOnly() {
  test.skip(
    test.info().project.name !== 'chromium',
    'desktop-only canvas journey',
  )
}

function mobileOnly() {
  test.skip(test.info().project.name !== 'mobile', 'mobile-only canvas journey')
}

test('file card opens canvas instead of downloading and separate download returns exact bytes', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const markdown =
    '# Canvas Open Journey\n\nSeeded open-journey body for canvas verification.\n'
  const conversation = await seedConversation({
    userId,
    title: 'canvas open journey',
  })
  const artifact = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'prd',
    title: 'Canvas Open Journey PRD',
    versions: [
      {
        fileName: 'canvas-open-journey.md',
        markdown,
        changeSummary: 'Created artifact',
      },
    ],
    createdAtBase: Date.now(),
  })
  const version = artifact.versions[0]
  if (!version) throw new Error('artifact fixture failed')

  const downloads: Download[] = []
  page.on('download', (download) => {
    downloads.push(download)
  })

  await gotoChatAndWaitForArtifactHydration(page, `/chat/${conversation.id}`)
  const card = fileCard(page, version.fileName)
  await expect(card).toBeVisible()

  await card.getByRole('button').click()
  const canvas = page.getByTestId('artifact-canvas')
  await expect(canvas).toBeVisible()
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded open-journey body for canvas verification.',
  )
  expect(downloads).toHaveLength(0)

  await page.getByTestId('artifact-close-panel').click()
  await expect(canvas).toBeHidden()

  const { download, bytes } = await downloadFrom(
    page,
    card.getByTestId('artifact-download-btn'),
  )
  expect(download.suggestedFilename()).toBe(version.fileName)
  expect(bytes.equals(Buffer.from(markdown, 'utf8'))).toBe(true)
})

test('prd, agent skill, and checklist previews render in canvas', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const conversation = await seedConversation({
    userId,
    title: 'canvas preview kinds',
  })
  const base = Date.now()
  const prd = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'prd',
    title: 'Canvas Preview PRD',
    versions: [
      {
        fileName: 'canvas-prd-preview.md',
        markdown:
          '# Seeded PRD Preview\n\n## Objective\n\nDeliver a verified canvas preview for the seeded PRD body.\n',
        changeSummary: 'Created artifact',
      },
    ],
    createdAtBase: base,
  })
  const skill = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'agent-skill',
    title: 'Canvas Preview Skill',
    versions: [
      {
        fileName: 'canvas-skill-preview.md',
        markdown:
          '---\nname: canvas-preview-skill\n---\n\n# Seeded Skill Preview\n\n## When to Use\n\nSeeded skill preview body for canvas verification.\n',
        changeSummary: 'Created artifact',
      },
    ],
    createdAtBase: base + 10_000,
  })
  const checklist = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'checklist',
    title: 'Canvas Preview Checklist',
    versions: [
      {
        fileName: 'canvas-checklist-preview.md',
        markdown:
          '# Seeded Checklist Preview\n\n- [ ] Seeded checklist item one\n- [ ] Seeded checklist item two\n',
        changeSummary: 'Created artifact',
      },
    ],
    createdAtBase: base + 20_000,
  })

  await gotoChatAndWaitForArtifactHydration(page, `/chat/${conversation.id}`)
  const previewExpectations = [
    { seeded: prd, headingName: 'Seeded PRD Preview' },
    { seeded: skill, headingName: 'Seeded Skill Preview' },
    { seeded: checklist, headingName: 'Seeded Checklist Preview' },
  ]
  for (const { seeded, headingName } of previewExpectations) {
    const version = seeded.versions[0]
    if (!version) throw new Error('artifact fixture failed')
    await openArtifactCard(page, version.fileName)
    await expect(page.getByTestId('artifact-header-title')).toHaveText(
      seeded.title,
    )
    await expect(
      page
        .getByTestId('artifact-preview')
        .getByRole('heading', { name: headingName }),
    ).toBeVisible()
  }
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded checklist item two',
  )
})

test('canvas tabs open, dedupe, switch, select versions, and close', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const conversation = await seedConversation({
    userId,
    title: 'canvas tabs journey',
  })
  const base = Date.now()
  const alpha = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'prd',
    title: 'Canvas Tabs Alpha',
    versions: [
      {
        fileName: 'canvas-tabs-alpha-one.md',
        markdown:
          '# Canvas Tabs Alpha One\n\nSeeded alpha one body for tab verification.\n',
        changeSummary: 'Created artifact',
      },
      {
        fileName: 'canvas-tabs-alpha-two.md',
        markdown:
          '# Canvas Tabs Alpha Two\n\nSeeded alpha two body for tab verification.\n',
        changeSummary: 'Revised artifact',
      },
    ],
    createdAtBase: base,
  })
  const alphaOne = alpha.versions[0]
  const alphaTwo = alpha.versions[1]
  if (!alphaOne || !alphaTwo) throw new Error('artifact fixture failed')
  const beta = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'checklist',
    title: 'Canvas Tabs Beta',
    versions: [
      {
        fileName: 'canvas-tabs-beta.md',
        markdown:
          '# Canvas Tabs Beta\n\nSeeded beta body for tab verification.\n',
        changeSummary: 'Created artifact',
      },
    ],
    createdAtBase: base + 10_000,
  })
  const betaVersion = beta.versions[0]
  if (!betaVersion) throw new Error('artifact fixture failed')

  await gotoChatAndWaitForArtifactHydration(page, `/chat/${conversation.id}`)
  const tabs = page.getByTestId('artifact-tabs').getByRole('tab')
  const versionSelect = page.getByTestId('artifact-version-select')

  await openArtifactCard(page, alphaTwo.fileName)
  await expect(tabs).toHaveCount(1)

  await openArtifactCard(page, alphaOne.fileName)
  await expect(tabs).toHaveCount(1)
  await expect(versionSelect).toHaveValue(alphaOne.versionId)
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded alpha one body for tab verification.',
  )

  await openArtifactCard(page, betaVersion.fileName)
  await expect(tabs).toHaveCount(2)
  await expect(
    page.getByTestId(`artifact-tab-${beta.artifactId}`),
  ).toHaveAttribute('aria-selected', 'true')

  await page.getByTestId(`artifact-tab-${alpha.artifactId}`).click()
  await expect(
    page.getByTestId(`artifact-tab-${alpha.artifactId}`),
  ).toHaveAttribute('aria-selected', 'true')
  await expect(versionSelect).toHaveValue(alphaOne.versionId)

  await versionSelect.selectOption({ label: 'Version 2' })
  await expect(versionSelect).toHaveValue(alphaTwo.versionId)
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded alpha two body for tab verification.',
  )

  await page.getByTestId(`artifact-close-${beta.artifactId}`).click()
  await expect(tabs).toHaveCount(1)
  await expect(
    page.getByTestId(`artifact-tab-${alpha.artifactId}`),
  ).toHaveAttribute('aria-selected', 'true')

  await page.getByTestId(`artifact-header-close-${alpha.artifactId}`).click()
  await expect(page.getByTestId('artifact-canvas')).toBeHidden()
  await expect(
    page.getByTestId('conversation-artifact-layout'),
  ).toHaveAttribute('data-canvas-open', 'false')
})

test('seeded artifact opens current v2 while v1 stays selectable and downloadable', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const markdownV1 =
    '# Canvas Versions One\n\nSeeded version one body for revision verification.\n'
  const markdownV2 =
    '# Canvas Versions Two\n\nSeeded version two body for revision verification.\n'
  const conversation = await seedConversation({
    userId,
    title: 'canvas versions journey',
  })
  const artifact = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'prd',
    title: 'Canvas Versions PRD',
    versions: [
      {
        fileName: 'canvas-versions-one.md',
        markdown: markdownV1,
        changeSummary: 'Created artifact',
      },
      {
        fileName: 'canvas-versions-two.md',
        markdown: markdownV2,
        changeSummary: 'Revised artifact',
      },
    ],
    createdAtBase: Date.now(),
  })
  const v1 = artifact.versions[0]
  const v2 = artifact.versions[1]
  if (!v1 || !v2) throw new Error('artifact fixture failed')

  await gotoChatAndWaitForArtifactHydration(page, `/chat/${conversation.id}`)
  await openArtifactCard(page, v2.fileName)
  const versionSelect = page.getByTestId('artifact-version-select')
  await expect(versionSelect).toHaveValue(v2.versionId)
  await expect(versionSelect.getByRole('option')).toHaveCount(2)
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded version two body for revision verification.',
  )

  await versionSelect.selectOption({ label: 'Version 1' })
  await expect(versionSelect).toHaveValue(v1.versionId)
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded version one body for revision verification.',
  )

  const headerDownload = page.getByTestId('artifact-download')
  const { download, bytes } = await downloadFrom(page, headerDownload)
  expect(download.suggestedFilename()).toBe(v1.fileName)
  expect(bytes.equals(Buffer.from(markdownV1, 'utf8'))).toBe(true)

  await versionSelect.selectOption({ label: 'Version 2' })
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded version two body for revision verification.',
  )
})

test('refresh closes ephemeral tabs but persisted cards and version history reopen', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const conversation = await seedConversation({
    userId,
    title: 'canvas reload journey',
  })
  const base = Date.now()
  const alpha = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'prd',
    title: 'Canvas Reload Alpha',
    versions: [
      {
        fileName: 'canvas-reload-alpha-one.md',
        markdown:
          '# Canvas Reload Alpha One\n\nSeeded reload alpha one body.\n',
        changeSummary: 'Created artifact',
      },
      {
        fileName: 'canvas-reload-alpha-two.md',
        markdown:
          '# Canvas Reload Alpha Two\n\nSeeded reload alpha two body.\n',
        changeSummary: 'Revised artifact',
      },
    ],
    createdAtBase: base,
  })
  const alphaOne = alpha.versions[0]
  const alphaTwo = alpha.versions[1]
  if (!alphaOne || !alphaTwo) throw new Error('artifact fixture failed')
  const beta = await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'checklist',
    title: 'Canvas Reload Beta',
    versions: [
      {
        fileName: 'canvas-reload-beta.md',
        markdown: '# Canvas Reload Beta\n\nSeeded reload beta body.\n',
        changeSummary: 'Created artifact',
      },
    ],
    createdAtBase: base + 10_000,
  })
  const betaVersion = beta.versions[0]
  if (!betaVersion) throw new Error('artifact fixture failed')

  await gotoChatAndWaitForArtifactHydration(page, `/chat/${conversation.id}`)
  await openArtifactCard(page, alphaTwo.fileName)
  await openArtifactCard(page, betaVersion.fileName)
  const tabs = page.getByTestId('artifact-tabs').getByRole('tab')
  await expect(tabs).toHaveCount(2)

  await reloadAndWaitForArtifactHydration(page)
  await expect(
    page.getByTestId('conversation-artifact-layout'),
  ).toHaveAttribute('data-canvas-open', 'false')
  await expect(page.getByTestId('artifact-canvas')).toBeHidden()
  await expect(fileCard(page, alphaTwo.fileName)).toBeVisible()
  await expect(fileCard(page, betaVersion.fileName)).toBeVisible()

  await openArtifactCard(page, alphaTwo.fileName)
  await expect(tabs).toHaveCount(1)
  await expect(
    page.getByTestId(`artifact-tab-${alpha.artifactId}`),
  ).toBeVisible()
  await expect(
    page.getByTestId(`artifact-tab-${beta.artifactId}`),
  ).not.toBeAttached()
  const versionSelect = page.getByTestId('artifact-version-select')
  await expect(versionSelect).toHaveValue(alphaTwo.versionId)
  await expect(versionSelect.getByRole('option')).toHaveCount(2)
  await versionSelect.selectOption({ label: 'Version 1' })
  await expect(versionSelect).toHaveValue(alphaOne.versionId)
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded reload alpha one body.',
  )
})

test('chat stays scrollable and composer submits while canvas is open', async ({
  page,
}) => {
  desktopOnly()
  const userId = scopedUserId()
  const conversation = await seedConversation({
    userId,
    title: 'canvas chat probe',
  })
  const markdown =
    '# Canvas Chat Probe\n\nSeeded chat probe body for canvas verification.\n'
  await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'prd',
    title: 'Canvas Chat Probe PRD',
    versions: [
      {
        fileName: 'canvas-chat-probe.md',
        markdown,
        changeSummary: 'Created artifact',
      },
    ],
    createdAtBase: Date.now(),
  })
  const base = Date.now() + 10_000
  for (let index = 0; index < 24; index++) {
    await db.insert(messages).values([
      {
        conversationId: conversation.id,
        role: 'user',
        content: `Seeded scroll probe user message ${index}.`,
        createdAt: new Date(base + index * 2000),
      },
      {
        conversationId: conversation.id,
        role: 'assistant',
        content: `Seeded scroll probe assistant reply ${index} with enough body text to fill the chat pane height.`,
        createdAt: new Date(base + index * 2000 + 1000),
      },
    ])
  }

  await gotoChatAndWaitForArtifactHydration(page, `/chat/${conversation.id}`)
  await openArtifactCard(page, 'canvas-chat-probe.md')
  const scrollArea = page.getByTestId('chat-messages-scroll-area')
  await expect(scrollArea).toBeVisible()
  await expect
    .poll(() =>
      scrollArea.evaluate(
        (element) => element.scrollHeight > element.clientHeight,
      ),
    )
    .toBe(true)
  await scrollArea.evaluate((element) => {
    element.scrollTop = element.scrollHeight
  })
  await expect
    .poll(() => scrollArea.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0)

  let sendIntercepted = false
  await page.route('**/_serverFn/**', async (route) => {
    const request = route.request()
    if (
      request.method() !== 'POST' ||
      !request.postData()?.includes('Canvas open submission probe.')
    ) {
      await route.fallback()
      return
    }
    sendIntercepted = true
    await route.fulfill({
      status: 200,
      headers: {
        'x-tss-raw': 'true',
        'content-type': 'text/plain; charset=utf-8',
      },
      body: 'Canvas open chat probe terminal response.',
    })
  })

  const composerInput = page.getByTestId('composer-input')
  await composerInput.fill('Canvas open submission probe.')
  const sendButton = page.getByTestId('send-button')
  await expect(sendButton).toBeEnabled()
  await sendButton.click()
  await expect(composerInput).toHaveValue('')
  await expect(sendButton).toBeEnabled()
  expect(sendIntercepted).toBe(true)
  await expect(page.getByTestId('artifact-canvas')).toBeVisible()
})

test('mobile canvas replaces chat and composer draft survives return', async ({
  page,
}) => {
  mobileOnly()
  const userId = scopedUserId()
  const conversation = await seedConversation({
    userId,
    title: 'canvas mobile journey',
  })
  await seedArtifactWithVersions({
    userId,
    conversationId: conversation.id,
    kind: 'prd',
    title: 'Canvas Mobile PRD',
    versions: [
      {
        fileName: 'canvas-mobile.md',
        markdown:
          '# Canvas Mobile\n\nSeeded mobile body for canvas verification.\n',
        changeSummary: 'Created artifact',
      },
    ],
    createdAtBase: Date.now(),
  })

  await gotoChatAndWaitForArtifactHydration(page, `/chat/${conversation.id}`)
  const draft = 'Draf canvas mobile tetap.'
  const composerInput = page.getByTestId('composer-input')
  await composerInput.fill(draft)

  await openArtifactCard(page, 'canvas-mobile.md')
  const layout = page.getByTestId('conversation-artifact-layout')
  await expect(layout).toHaveAttribute('data-canvas-open', 'true')
  await expect(page.getByTestId('canvas-pane')).toBeVisible()
  await expect(page.getByTestId('chat-pane')).toBeHidden()
  await expect(page.getByTestId('artifact-preview')).toContainText(
    'Seeded mobile body for canvas verification.',
  )

  await page.getByTestId('artifact-back-to-chat').click()
  await expect(layout).toHaveAttribute('data-canvas-open', 'false')
  await expect(page.getByTestId('chat-pane')).toBeVisible()
  await expect(page.getByTestId('canvas-pane')).toBeHidden()
  await expect(composerInput).toHaveValue(draft)
})
