/**
 * @vitest-environment node
 */
import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db'
import {
  conversations,
  generationRuns,
  messages,
  users,
} from '../../src/lib/db/schema'

const ownerId = 'phase-04-owner'
const otherId = 'phase-04-other'

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

describe('conversation persistence', () => {
  beforeAll(async () => {
    await cleanup()
    await db.insert(users).values([
      { id: ownerId, email: 'phase-04-owner@example.com', name: 'Owner' },
      { id: otherId, email: 'phase-04-other@example.com', name: 'Other' },
    ])
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
    await db.insert(conversations).values([
      { userId: ownerId, title: 'Owner chat 1' },
      { userId: ownerId, title: 'Owner chat 2' },
      { userId: otherId, title: 'Other chat 1' },
    ])

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
  })
})
