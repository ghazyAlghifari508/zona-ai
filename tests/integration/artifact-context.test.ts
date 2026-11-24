/**
 * @vitest-environment node
 */

import { and, eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  generationRuns,
  messageArtifactMentions,
  messages,
  users,
} from '../../src/lib/db/schema'

const USER_ID = 'artifact-context-owner'
const USER_EMAIL = 'artifact-context-owner@example.com'

const capturedChatMessages: Array<unknown> = []
const capturedChatSystems: Array<unknown> = []
let r2Storage = new Map<string, Buffer>()

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: vi.fn((opts: Record<string, unknown>) => {
      capturedChatMessages.push(opts.messages)
      capturedChatSystems.push(opts.system)
      const onFinish = opts.onFinish as
        | ((o: unknown) => Promise<void>)
        | undefined
      if (onFinish) {
        setTimeout(() => {
          void onFinish({
            text: 'Context answer response',
            usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
            finishReason: 'stop',
          })
        }, 10)
      }
      return {
        text: Promise.resolve('Context answer response'),
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue('Context answer response')
            controller.close()
          },
        }),
        toUIMessageStreamResponse: (init?: {
          headers?: Record<string, string>
        }) => new Response('Context answer response', { headers: init?.headers }),
        toTextStreamResponse: () => new Response('Context answer response'),
      }
    }),
  }
})

let getObjectCallCount = 0
vi.mock('../../src/lib/r2/client', () => ({
  getObject: vi.fn(async (locator: { bucket: string; key: string }) => {
    getObjectCallCount++
    const storageKey = `${locator.bucket}/${locator.key}`
    const data = r2Storage.get(storageKey)
    if (!data) {
      throw new Error(`R2 Object not found: ${storageKey}`)
    }
    return {
      body: data,
      contentType: 'text/markdown',
    }
  }),
  putObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: USER_ID, email: USER_EMAIL },
  })),
}))

async function resetOwner() {
  await db.delete(users).where(eq(users.id, USER_ID))
  await db.insert(users).values({
    id: USER_ID,
    email: USER_EMAIL,
    name: 'Artifact context owner',
    credits: 1000,
  })
}

async function createConversation() {
  const [conversation] = await db
    .insert(conversations)
    .values({ userId: USER_ID, title: 'Context conversation' })
    .returning({ id: conversations.id })
  if (!conversation) throw new Error('Conversation fixture failed')
  return conversation.id
}

async function seedArtifactWithTwoVersions(
  conversationId: string,
  title: string,
) {
  const [msg1] = await db
    .insert(messages)
    .values({
      conversationId,
      role: 'assistant',
      content: '',
    })
    .returning({ id: messages.id })
  if (!msg1) throw new Error('Message 1 failed')

  const [gen1] = await db
    .insert(generationRuns)
    .values({
      messageId: msg1.id,
      conversationId,
      modelId: 'model-internal',
      routerModelId: 'router/model',
      skillId: 'prd-plan',
      status: 'completed',
      content: 'Version 1 summary in DB',
    })
    .returning({ id: generationRuns.id })
  if (!gen1) throw new Error('Generation 1 failed')

  const r2KeyV1 = `context-test/${crypto.randomUUID()}-v1.md`
  const v1Content = `# ${title} - Exact Version 1 Content`
  r2Storage.set(`artifact-bucket/${r2KeyV1}`, Buffer.from(v1Content, 'utf8'))

  const [att1] = await db
    .insert(attachments)
    .values({
      userId: USER_ID,
      messageId: msg1.id,
      conversationId,
      fileName: `${title}-v1.md`,
      fileSize: Buffer.byteLength(v1Content),
      mimeType: 'text/markdown',
      r2Key: r2KeyV1,
      r2Bucket: 'artifact-bucket',
      processingStatus: 'completed',
    })
    .returning({ id: attachments.id })
  if (!att1) throw new Error('Attachment 1 failed')

  const [artifact] = await db
    .insert(artifacts)
    .values({
      userId: USER_ID,
      conversationId,
      kind: 'prd',
      title,
    })
    .returning({ id: artifacts.id })
  if (!artifact) throw new Error('Artifact failed')

  const [ver1] = await db
    .insert(artifactVersions)
    .values({
      artifactId: artifact.id,
      conversationId,
      version: 1,
      attachmentId: att1.id,
      generationRunId: gen1.id,
      title: `${title} v1`,
      changeSummary: 'Initial version',
      createdByModelId: 'model-internal',
      createdByRouterModelId: 'router/model',
    })
    .returning({ id: artifactVersions.id })
  if (!ver1) throw new Error('Version 1 failed')

  // Version 2
  const [msg2] = await db
    .insert(messages)
    .values({
      conversationId,
      role: 'assistant',
      content: '',
    })
    .returning({ id: messages.id })
  if (!msg2) throw new Error('Message 2 failed')

  const [gen2] = await db
    .insert(generationRuns)
    .values({
      messageId: msg2.id,
      conversationId,
      modelId: 'model-internal',
      routerModelId: 'router/model',
      skillId: 'prd-plan',
      status: 'completed',
      content: 'Version 2 summary in DB',
    })
    .returning({ id: generationRuns.id })
  if (!gen2) throw new Error('Generation 2 failed')

  const r2KeyV2 = `context-test/${crypto.randomUUID()}-v2.md`
  const v2Content = `# ${title} - Exact Version 2 Content (Latest)`
  r2Storage.set(`artifact-bucket/${r2KeyV2}`, Buffer.from(v2Content, 'utf8'))

  const [att2] = await db
    .insert(attachments)
    .values({
      userId: USER_ID,
      messageId: msg2.id,
      conversationId,
      fileName: `${title}-v2.md`,
      fileSize: Buffer.byteLength(v2Content),
      mimeType: 'text/markdown',
      r2Key: r2KeyV2,
      r2Bucket: 'artifact-bucket',
      processingStatus: 'completed',
    })
    .returning({ id: attachments.id })
  if (!att2) throw new Error('Attachment 2 failed')

  const [ver2] = await db
    .insert(artifactVersions)
    .values({
      artifactId: artifact.id,
      conversationId,
      version: 2,
      sourceVersionId: ver1.id,
      attachmentId: att2.id,
      generationRunId: gen2.id,
      title: `${title} v2`,
      changeSummary: 'Updated version',
      createdByModelId: 'model-internal',
      createdByRouterModelId: 'router/model',
    })
    .returning({ id: artifactVersions.id })
  if (!ver2) throw new Error('Version 2 failed')

  await db
    .update(artifacts)
    .set({ currentVersionId: ver2.id })
    .where(eq(artifacts.id, artifact.id))

  return {
    artifactId: artifact.id,
    v1: { versionId: ver1.id, content: v1Content },
    v2: { versionId: ver2.id, content: v2Content },
  }
}

describe('artifact context injection in chat and compare', () => {
  beforeAll(async () => {
    await resetOwner()
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID))
  })

  it('injects the exact selected version bytes from R2 into streamText', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const conversationId = await createConversation()
    const seeded = await seedArtifactWithTwoVersions(
      conversationId,
      'ExactPRD',
    )

    capturedChatMessages.length = 0
    // Request specifically version 1 (not the latest version 2)
    await sendMessageCore({
      data: {
        conversationId,
        modelId: 'cx/gpt-6.2-sol',
        content: 'Explain the early version of this artifact',
        artifactMentions: [
          {
            artifactId: seeded.artifactId,
            versionId: seeded.v1.versionId,
            mode: 'context',
          },
        ],
      },
      request: new Request('http://localhost:3000/api/chat', {
        method: 'POST',
      }),
    })

    expect(capturedChatMessages.length).toBeGreaterThan(0)
    const lastMessages = capturedChatMessages[
      capturedChatMessages.length - 1
    ] as Array<{ role: string; content: string }>

    const mentionMessage = lastMessages.find(
      (m) =>
        typeof m.content === 'string' &&
        m.content.includes('[ATTACHED ARTIFACT:'),
    )
    expect(mentionMessage).toBeDefined()
    expect(mentionMessage?.content).toContain('Exact Version 1 Content')
    expect(mentionMessage?.content).not.toContain(
      'Exact Version 2 Content (Latest)',
    )
    expect(mentionMessage?.content).not.toContain('Version 1 summary in DB')
  })

  it('preserves the order of multiple context mentions', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const conversationId = await createConversation()
    const docA = await seedArtifactWithTwoVersions(conversationId, 'DocAlpha')
    const docB = await seedArtifactWithTwoVersions(conversationId, 'DocBeta')

    capturedChatMessages.length = 0
    await sendMessageCore({
      data: {
        conversationId,
        modelId: 'cx/gpt-6.2-sol',
        content: 'Compare Alpha and Beta',
        artifactMentions: [
          {
            artifactId: docB.artifactId,
            versionId: docB.v1.versionId,
            mode: 'context',
          },
          {
            artifactId: docA.artifactId,
            versionId: docA.v1.versionId,
            mode: 'context',
          },
        ],
      },
      request: new Request('http://localhost:3000/api/chat', {
        method: 'POST',
      }),
    })

    const lastMessages = capturedChatMessages[
      capturedChatMessages.length - 1
    ] as Array<{ role: string; content: string }>
    const serialized = JSON.stringify(lastMessages)

    const indexB = serialized.indexOf('DocBeta')
    const indexA = serialized.indexOf('DocAlpha')
    expect(indexB).toBeGreaterThan(-1)
    expect(indexA).toBeGreaterThan(-1)
    // DocB was mentioned first, so it must appear before DocA
    expect(indexB).toBeLessThan(indexA)
  })

  it('loads each source once in Compare Mode before fan-out', async () => {
    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const conversationId = await createConversation()
    const doc = await seedArtifactWithTwoVersions(conversationId, 'CompareDoc')

    getObjectCallCount = 0
    await sendCompareMessageCore({
      data: {
        conversationId,
        modelIds: ['cent-ai/qwen3.8-flash', 'cx/gpt-6.2-sol'],
        content: 'Analyze this doc with both models',
        artifactMentions: [
          {
            artifactId: doc.artifactId,
            versionId: doc.v1.versionId,
            mode: 'context',
          },
        ],
      },
      request: new Request('http://localhost:3000/api/chat/compare', {
        method: 'POST',
      }),
    })

    // Exactly 1 getObject call for the single mention despite 2 models streaming
    expect(getObjectCallCount).toBe(1)
  })

  it('does not leak old artifact bodies into later unrelated turns', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const conversationId = await createConversation()
    const doc = await seedArtifactWithTwoVersions(conversationId, 'TurnDoc')

    // Turn 1: with mention
    await sendMessageCore({
      data: {
        conversationId,
        modelId: 'cx/gpt-6.2-sol',
        content: 'Turn 1 with mention',
        artifactMentions: [
          {
            artifactId: doc.artifactId,
            versionId: doc.v1.versionId,
            mode: 'context',
          },
        ],
      },
      request: new Request('http://localhost:3000/api/chat', {
        method: 'POST',
      }),
    })

    // Turn 2: without mention
    capturedChatMessages.length = 0
    await sendMessageCore({
      data: {
        conversationId,
        modelId: 'cx/gpt-6.2-sol',
        content: 'Turn 2 regular question without mentions',
      },
      request: new Request('http://localhost:3000/api/chat', {
        method: 'POST',
      }),
    })

    const lastMessages = capturedChatMessages[
      capturedChatMessages.length - 1
    ] as Array<{ role: string; content: string }>
    const serialized = JSON.stringify(lastMessages)

    // Turn 2 prompt history must NOT include TurnDoc full body
    expect(serialized).not.toContain('Exact Version 1 Content')
  })

  it('injects safe catalog labels into system prompt when unmentioned artifacts exist', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const conversationId = await createConversation()
    await seedArtifactWithTwoVersions(conversationId, 'CatalogDoc')

    capturedChatSystems.length = 0
    await sendMessageCore({
      data: {
        conversationId,
        modelId: 'cx/gpt-6.2-sol',
        content: 'Can you see what files we have?',
      },
      request: new Request('http://localhost:3000/api/chat', {
        method: 'POST',
      }),
    })

    expect(capturedChatSystems.length).toBeGreaterThan(0)
    const system = String(
      capturedChatSystems[capturedChatSystems.length - 1],
    )
    expect(system).toContain('CatalogDoc')
    expect(system).toContain('The following artifacts currently exist')
    expect(system).not.toContain('Exact Version 1 Content')
  })

  it('never creates new artifact versions or changes currentVersionId on context mentions', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const conversationId = await createConversation()
    const doc = await seedArtifactWithTwoVersions(conversationId, 'NoSideEffect')

    const [beforeArtifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, doc.artifactId))
    const beforeVersions = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, doc.artifactId))

    await sendMessageCore({
      data: {
        conversationId,
        modelId: 'cx/gpt-6.2-sol',
        content: 'Please summarize this document',
        artifactMentions: [
          {
            artifactId: doc.artifactId,
            versionId: doc.v1.versionId,
            mode: 'context',
          },
        ],
      },
      request: new Request('http://localhost:3000/api/chat', {
        method: 'POST',
      }),
    })

    const [afterArtifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, doc.artifactId))
    const afterVersions = await db
      .select()
      .from(artifactVersions)
      .where(eq(artifactVersions.artifactId, doc.artifactId))

    expect(afterArtifact?.currentVersionId).toBe(
      beforeArtifact?.currentVersionId,
    )
    expect(afterVersions.length).toBe(beforeVersions.length)
  })

  it('rejects revise mentions in ordinary chat', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const conversationId = await createConversation()
    const doc = await seedArtifactWithTwoVersions(conversationId, 'ReviseChat')

    await expect(
      sendMessageCore({
        data: {
          conversationId,
          modelId: 'cx/gpt-6.2-sol',
          content: 'Ubah dokumen ini',
          artifactMentions: [
            {
              artifactId: doc.artifactId,
              versionId: doc.v2.versionId,
              mode: 'revise',
            },
          ],
        },
        request: new Request('http://localhost:3000/api/chat', {
          method: 'POST',
        }),
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('populates requestMessageId on generationRuns for single and compare chat', async () => {
    const { sendCompareMessageCore, sendMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const conversationId = await createConversation()

    // Single chat
    const singleRes = await sendMessageCore({
      data: {
        conversationId,
        modelId: 'cx/gpt-6.2-sol',
        content: 'Single chat prompt',
      },
      request: new Request('http://localhost:3000/api/chat', {
        method: 'POST',
      }),
    })
    const singleGenId = singleRes.headers.get('X-Generation-Id') as string
    const [singleRun] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, singleGenId))
    expect(singleRun?.requestMessageId).toBeDefined()
    expect(singleRun?.requestMessageId).not.toBeNull()

    // Compare chat
    const compareRes = await sendCompareMessageCore({
      data: {
        conversationId,
        modelIds: ['cent-ai/qwen3.8-flash', 'cx/gpt-6.2-sol'],
        content: 'Compare chat prompt',
      },
      request: new Request('http://localhost:3000/api/chat/compare', {
        method: 'POST',
      }),
    })
    const [compRun] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
    expect(compRun).toBeDefined()

    const runs = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.conversationId, conversationId))
    const compareRuns = runs.filter((r) => r.comparisonRunId !== null)
    expect(compareRuns.length).toBeGreaterThanOrEqual(2)
    for (const r of compareRuns) {
      expect(r.requestMessageId).toBeDefined()
      expect(r.requestMessageId).not.toBeNull()
    }
  })
})
