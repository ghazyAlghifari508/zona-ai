/**
 * @vitest-environment node
 */
import { eq, inArray } from 'drizzle-orm'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import { db } from '../../src/lib/db'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  generationRuns,
  messages,
  users,
} from '../../src/lib/db/schema'

const ownerId = 'phase-04-owner'
const otherId = 'phase-04-other'

const { deleteObjectMock } = vi.hoisted(() => ({
  deleteObjectMock: vi.fn(
    async (_locator: { bucket: string; key: string }): Promise<void> => {},
  ),
}))

vi.mock('../../src/lib/r2/client', () => ({
  deleteObject: deleteObjectMock,
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async (request: Request) => ({
    user: { id: request.headers.get('x-test-user') ?? ownerId },
  })),
}))

const requestFor = (userId: string) =>
  new Request('http://localhost', { headers: { 'x-test-user': userId } })

async function cleanup() {
  await db
    .delete(conversations)
    .where(inArray(conversations.userId, [ownerId, otherId]))
  await db.delete(users).where(inArray(users.id, [ownerId, otherId]))
}

async function seedAttachment(input: {
  conversationId: string
  userId: string
  bucket: string
  key: string
}) {
  const [attachment] = await db
    .insert(attachments)
    .values({
      conversationId: input.conversationId,
      userId: input.userId,
      fileName: 'upload.txt',
      fileSize: 6,
      mimeType: 'text/plain',
      r2Bucket: input.bucket,
      r2Key: input.key,
      processingStatus: 'completed',
    })
    .returning({ id: attachments.id })
  if (!attachment) throw new Error('attachment fixture failed')
  return attachment
}

async function seedArtifactAttachment(input: {
  conversationId: string
  userId: string
  bucket: string
  key: string
}) {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: 'assistant',
      content: 'Artifact fixture',
    })
    .returning({ id: messages.id })
  if (!message) throw new Error('message fixture failed')
  const [generation] = await db
    .insert(generationRuns)
    .values({
      conversationId: input.conversationId,
      messageId: message.id,
      modelId: input.userId,
      routerModelId: `test/${input.userId}`,
      status: 'completed',
    })
    .returning({ id: generationRuns.id })
  if (!generation) throw new Error('generation fixture failed')
  const attachment = await seedAttachment(input)
  const [artifact] = await db
    .insert(artifacts)
    .values({
      conversationId: input.conversationId,
      userId: input.userId,
      kind: 'prd',
      title: 'Artifact fixture',
    })
    .returning({ id: artifacts.id })
  if (!artifact) throw new Error('artifact fixture failed')
  const [version] = await db
    .insert(artifactVersions)
    .values({
      artifactId: artifact.id,
      conversationId: input.conversationId,
      version: 1,
      attachmentId: attachment.id,
      generationRunId: generation.id,
      title: 'Artifact fixture',
      createdByModelId: input.userId,
      createdByRouterModelId: `test/${input.userId}`,
      changeSummary: 'Created',
    })
    .returning({ id: artifactVersions.id })
  if (!version) throw new Error('artifact version fixture failed')
  await db
    .update(artifacts)
    .set({ currentVersionId: version.id })
    .where(eq(artifacts.id, artifact.id))
  return { attachmentId: attachment.id, versionId: version.id }
}

describe('conversation persistence', () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(users).values([
      { id: ownerId, email: 'phase-04-owner@example.com', name: 'Owner' },
      { id: otherId, email: 'phase-04-other@example.com', name: 'Other' },
    ])
  })

  beforeEach(() => {
    deleteObjectMock.mockReset()
    deleteObjectMock.mockResolvedValue(undefined)
  })

  afterAll(cleanup)

  it('paginates identical timestamps by id without leaking another owner', async () => {
    const { getConversationsCore } = await import(
      '../../src/server/core/conversations'
    )
    const updatedAt = new Date('2026-08-29T00:00:00.000Z')
    const ownIds = [
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
    ]
    await db.insert(conversations).values([
      { id: ownIds[1], userId: ownerId, title: 'Second', updatedAt },
      { id: ownIds[0], userId: ownerId, title: 'First', updatedAt },
      {
        id: '10000000-0000-4000-8000-000000000003',
        userId: otherId,
        title: 'Private',
        updatedAt,
      },
    ])

    const first = await getConversationsCore({
      data: { limit: 1 },
      request: requestFor(ownerId),
    })
    const second = await getConversationsCore({
      data: {
        cursor: first.nextCursor,
        limit: 1,
      },
      request: requestFor(ownerId),
    })

    expect(first.conversations.map(({ id }) => id)).toEqual([ownIds[0]])
    expect(second.conversations.map(({ id }) => id)).toEqual([ownIds[1]])
    expect(
      new Set(
        [...first.conversations, ...second.conversations].map(({ id }) => id),
      ).size,
    ).toBe(2)
  })

  it('supports create, server search, and rename validation', async () => {
    const {
      createConversationCore,
      getConversationsCore,
      updateConversationCore,
    } = await import('../../src/server/core/conversations')
    const { updateConversationSchema } = await import(
      '../../src/lib/utils/validation'
    )
    const created = await createConversationCore({
      data: { title: 'Alpha search', mode: 'normal' },
      request: requestFor(ownerId),
    })
    const renamed = await updateConversationCore({
      data: { id: created.id, title: 'Alpha renamed' },
      request: requestFor(ownerId),
    })
    const found = await getConversationsCore({
      data: { limit: 20, search: 'renamed' },
      request: requestFor(ownerId),
    })

    expect(renamed.title).toBe('Alpha renamed')
    expect(found.conversations.some(({ id }) => id === created.id)).toBe(true)
    expect(() =>
      updateConversationSchema.parse({ id: created.id, title: ' ' }),
    ).toThrow()
  })

  it('returns 403 for another owner and distinguishes missing resources', async () => {
    const { getConversationCore, updateConversationCore } = await import(
      '../../src/server/core/conversations'
    )
    const [privateConversation] = await db
      .insert(conversations)
      .values({ userId: otherId, title: 'Private' })
      .returning()

    await expect(
      getConversationCore({
        data: { id: privateConversation.id },
        request: requestFor(ownerId),
      }),
    ).rejects.toMatchObject({ status: 403 })
    await expect(
      updateConversationCore({
        data: { id: crypto.randomUUID(), title: 'Missing' },
        request: requestFor(ownerId),
      }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('deletes a conversation with its messages', async () => {
    const { createConversationCore, deleteConversationCore } = await import(
      '../../src/server/core/conversations'
    )
    const conversation = await createConversationCore({
      data: { title: 'Doomed', mode: 'normal' },
      request: requestFor(ownerId),
    })
    await db.insert(messages).values({
      conversationId: conversation.id,
      role: 'user',
      content: 'kept while conversation exists',
    })

    await deleteConversationCore({
      data: { id: conversation.id },
      request: requestFor(ownerId),
    })

    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
    const remaining = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversation.id))
    expect(row).toBeUndefined()
    expect(remaining).toEqual([])
  })

  it('deletes every persisted object before deleting the conversation row', async () => {
    const { createConversationCore, deleteConversationCore } = await import(
      '../../src/server/core/conversations'
    )
    const conversation = await createConversationCore({
      data: { title: 'Stored files', mode: 'normal' },
      request: requestFor(ownerId),
    })
    const ordinaryLocator = {
      bucket: 'ordinary-bucket',
      key: `ordinary/${crypto.randomUUID()}.txt`,
    }
    const artifactLocator = {
      bucket: 'artifact-bucket',
      key: `artifact/${crypto.randomUUID()}.md`,
    }
    await seedAttachment({
      conversationId: conversation.id,
      userId: ownerId,
      ...ordinaryLocator,
    })
    await seedArtifactAttachment({
      conversationId: conversation.id,
      userId: ownerId,
      ...artifactLocator,
    })
    const rowsSeenDuringStorageDelete: string[] = []
    deleteObjectMock.mockImplementation(async (locator) => {
      const [row] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(eq(conversations.id, conversation.id))
      if (row) rowsSeenDuringStorageDelete.push(locator.key)
    })

    await deleteConversationCore({
      data: { id: conversation.id },
      request: requestFor(ownerId),
    })

    expect(new Set(rowsSeenDuringStorageDelete)).toEqual(
      new Set([ordinaryLocator.key, artifactLocator.key]),
    )
    expect(deleteObjectMock.mock.calls.map(([locator]) => locator)).toEqual(
      expect.arrayContaining([ordinaryLocator, artifactLocator]),
    )
    const [conversationAfter] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
    expect(conversationAfter).toBeUndefined()
  })

  it('retains every database locator when storage cleanup fails and retries a previously deleted key safely', async () => {
    const { createConversationCore, deleteConversationCore } = await import(
      '../../src/server/core/conversations'
    )
    const conversation = await createConversationCore({
      data: { title: 'Retry cleanup', mode: 'normal' },
      request: requestFor(ownerId),
    })
    const firstLocator = {
      bucket: 'retry-bucket',
      key: `retry/${crypto.randomUUID()}-first.txt`,
    }
    const secondLocator = {
      bucket: 'retry-bucket',
      key: `retry/${crypto.randomUUID()}-second.txt`,
    }
    await seedAttachment({
      conversationId: conversation.id,
      userId: ownerId,
      ...firstLocator,
    })
    await seedAttachment({
      conversationId: conversation.id,
      userId: ownerId,
      ...secondLocator,
    })
    deleteObjectMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(
      deleteConversationCore({
        data: { id: conversation.id },
        request: requestFor(ownerId),
      }),
    ).rejects.toMatchObject({ status: 500 })

    const [retainedConversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
    const retainedLocators = await db
      .select({ bucket: attachments.r2Bucket, key: attachments.r2Key })
      .from(attachments)
      .where(eq(attachments.conversationId, conversation.id))
    expect(retainedConversation?.id).toBe(conversation.id)
    expect(retainedLocators).toEqual(
      expect.arrayContaining([firstLocator, secondLocator]),
    )

    deleteObjectMock.mockResolvedValue(undefined)
    await expect(
      deleteConversationCore({
        data: { id: conversation.id },
        request: requestFor(ownerId),
      }),
    ).resolves.toEqual({ success: true })
    expect(
      deleteObjectMock.mock.calls.filter(
        ([locator]) => locator.key === firstLocator.key,
      ),
    ).toHaveLength(2)
  })

  it('rejects cross-user conversation deletion before storage access', async () => {
    const { deleteConversationCore } = await import(
      '../../src/server/core/conversations'
    )
    const [conversation] = await db
      .insert(conversations)
      .values({ userId: otherId, title: 'Private stored files' })
      .returning({ id: conversations.id })
    await seedAttachment({
      conversationId: conversation.id,
      userId: otherId,
      bucket: 'other-owner-bucket',
      key: `other/${crypto.randomUUID()}.txt`,
    })
    deleteObjectMock.mockClear()

    await expect(
      deleteConversationCore({
        data: { id: conversation.id },
        request: requestFor(ownerId),
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(deleteObjectMock).not.toHaveBeenCalled()
  })

  it('loads messages ascending with generation runs and enforces ownership', async () => {
    const { getMessagesCore } = await import('../../src/server/core/messages')
    const [conversation] = await db
      .insert(conversations)
      .values({ userId: ownerId, title: 'Messages' })
      .returning()
    const [later, earlier] = await db
      .insert(messages)
      .values([
        {
          conversationId: conversation.id,
          role: 'assistant',
          content: 'later',
          createdAt: new Date('2026-08-29T02:00:00Z'),
        },
        {
          conversationId: conversation.id,
          role: 'user',
          content: 'earlier',
          createdAt: new Date('2026-08-29T01:00:00Z'),
        },
      ])
      .returning()
    await db.insert(generationRuns).values({
      messageId: later.id,
      conversationId: conversation.id,
      modelId: 'auto',
      routerModelId: 'test/router',
      status: 'completed',
      content: 'later',
    })

    const result = await getMessagesCore({
      data: { conversationId: conversation.id },
      request: requestFor(ownerId),
    })
    expect(result.map(({ id }) => id)).toEqual([earlier.id, later.id])
    expect(result[0].generationRuns).toEqual([])
    expect(result[1].generationRuns).toHaveLength(1)
    await expect(
      getMessagesCore({
        data: { conversationId: conversation.id },
        request: requestFor(otherId),
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('deleteAllConversationsCore deletes all conversations of the user without touching others', async () => {
    const { deleteAllConversationsCore, getConversationsCore } = await import(
      '../../src/server/core/conversations'
    )
    const inserted = await db
      .insert(conversations)
      .values([
        { userId: ownerId, title: 'Owner chat 1' },
        { userId: ownerId, title: 'Owner chat 2' },
        { userId: otherId, title: 'Other chat 1' },
      ])
      .returning({ id: conversations.id, userId: conversations.userId })
    const ownerConversation = inserted.find(({ userId }) => userId === ownerId)
    const otherConversation = inserted.find(({ userId }) => userId === otherId)
    if (!ownerConversation || !otherConversation) {
      throw new Error('conversation fixtures failed')
    }
    const ownerLocator = {
      bucket: 'bulk-owner-bucket',
      key: `bulk/${crypto.randomUUID()}-owner.txt`,
    }
    const otherLocator = {
      bucket: 'bulk-other-bucket',
      key: `bulk/${crypto.randomUUID()}-other.txt`,
    }
    await seedAttachment({
      conversationId: ownerConversation.id,
      userId: ownerId,
      ...ownerLocator,
    })
    await seedAttachment({
      conversationId: otherConversation.id,
      userId: otherId,
      ...otherLocator,
    })
    deleteObjectMock.mockClear()

    const res = await deleteAllConversationsCore({
      request: requestFor(ownerId),
    })
    expect(res).toEqual({ success: true })

    const ownerChats = await getConversationsCore({
      data: { limit: 10 },
      request: requestFor(ownerId),
    })
    expect(ownerChats.conversations).toHaveLength(0)

    const otherChats = await getConversationsCore({
      data: { limit: 10 },
      request: requestFor(otherId),
    })
    expect(otherChats.conversations.length).toBeGreaterThanOrEqual(1)
    expect(deleteObjectMock).toHaveBeenCalledWith(ownerLocator)
    expect(deleteObjectMock).not.toHaveBeenCalledWith(otherLocator)
  })

  it('retains all owned conversations and locators when bulk storage cleanup fails', async () => {
    const { deleteAllConversationsCore } = await import(
      '../../src/server/core/conversations'
    )
    const ownerConversations = await db
      .insert(conversations)
      .values([
        { userId: ownerId, title: 'Bulk retry 1' },
        { userId: ownerId, title: 'Bulk retry 2' },
      ])
      .returning({ id: conversations.id })
    const locators = await Promise.all(
      ownerConversations.map((conversation, index) =>
        seedAttachment({
          conversationId: conversation.id,
          userId: ownerId,
          bucket: 'bulk-retry-bucket',
          key: `bulk-retry/${index}-${crypto.randomUUID()}.txt`,
        }),
      ),
    )
    deleteObjectMock.mockReset()
    deleteObjectMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('storage unavailable'))

    await expect(
      deleteAllConversationsCore({ request: requestFor(ownerId) }),
    ).rejects.toMatchObject({ status: 500 })

    const retainedConversations = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(
        inArray(
          conversations.id,
          ownerConversations.map(({ id }) => id),
        ),
      )
    const retainedAttachments = await db
      .select({ id: attachments.id })
      .from(attachments)
      .where(
        inArray(
          attachments.id,
          locators.map(({ id }) => id),
        ),
      )
    expect(retainedConversations).toHaveLength(2)
    expect(retainedAttachments).toHaveLength(2)

    deleteObjectMock.mockResolvedValue(undefined)
    await expect(
      deleteAllConversationsCore({ request: requestFor(ownerId) }),
    ).resolves.toEqual({ success: true })
  })

  it('includes modelIds in conversations in chronological order of first use without duplicates', async () => {
    const { getConversationsCore } = await import(
      '../../src/server/core/conversations'
    )
    const [conv] = await db
      .insert(conversations)
      .values({ userId: ownerId, title: 'Multi-model Chat' })
      .returning()

    const [msg] = await db
      .insert(messages)
      .values({ conversationId: conv.id, role: 'assistant', content: 'test' })
      .returning()

    await db.insert(generationRuns).values([
      {
        messageId: msg.id,
        conversationId: conv.id,
        modelId: 'gemini-3.7-flash-high',
        routerModelId: 'test/gemini',
        status: 'completed',
        createdAt: new Date('2026-08-29T01:00:00Z'),
      },
      {
        messageId: msg.id,
        conversationId: conv.id,
        modelId: 'gpt-5.6-sol',
        routerModelId: 'test/gpt',
        status: 'completed',
        createdAt: new Date('2026-08-29T02:00:00Z'),
      },
      {
        messageId: msg.id,
        conversationId: conv.id,
        modelId: 'gemini-3.7-flash-high',
        routerModelId: 'test/gemini',
        status: 'completed',
        createdAt: new Date('2026-08-29T03:00:00Z'),
      },
    ])

    const res = await getConversationsCore({
      data: { limit: 10 },
      request: requestFor(ownerId),
    })
    const found = res.conversations.find((c) => c.id === conv.id)
    expect(found).toBeDefined()
    expect(found?.modelIds).toEqual(['gemini-3.7-flash-high', 'gpt-5.6-sol'])
  })
})
