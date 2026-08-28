/**
 * @vitest-environment node
 */
import { and, eq, inArray } from 'drizzle-orm'
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
      '../../src/server/functions/conversations'
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
      data: { limit: 1, includeArchived: false },
      request: requestFor(ownerId),
    })
    const second = await getConversationsCore({
      data: {
        cursor: first.nextCursor,
        limit: 1,
        includeArchived: false,
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

  it('supports create, server search, archive, and rename validation', async () => {
    const {
      archiveConversationCore,
      createConversationCore,
      getConversationsCore,
      updateConversationCore,
    } = await import('../../src/server/functions/conversations')
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
      data: { limit: 20, includeArchived: false, search: 'renamed' },
      request: requestFor(ownerId),
    })

    expect(renamed.title).toBe('Alpha renamed')
    expect(found.conversations.some(({ id }) => id === created.id)).toBe(true)
    expect(() =>
      updateConversationSchema.parse({ id: created.id, title: ' ' }),
    ).toThrow()

    await archiveConversationCore({
      data: { id: created.id },
      request: requestFor(ownerId),
    })
    const [archived] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, created.id))
    expect(archived.isArchived).toBe(true)
  })

  it('returns 403 for another owner and distinguishes missing resources', async () => {
    const { getConversationCore, updateConversationCore } = await import(
      '../../src/server/functions/conversations'
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

  it('soft deletes by default and hard deletes explicitly', async () => {
    const { createConversationCore, deleteConversationCore } = await import(
      '../../src/server/functions/conversations'
    )
    const soft = await createConversationCore({
      data: { title: 'Soft', mode: 'normal' },
      request: requestFor(ownerId),
    })
    const hard = await createConversationCore({
      data: { title: 'Hard', mode: 'normal' },
      request: requestFor(ownerId),
    })

    await deleteConversationCore({
      data: { id: soft.id, hard: false },
      request: requestFor(ownerId),
    })
    await deleteConversationCore({
      data: { id: hard.id, hard: true },
      request: requestFor(ownerId),
    })

    const [softRow] = await db
      .select()
      .from(conversations)
      .where(
        and(eq(conversations.id, soft.id), eq(conversations.isArchived, true)),
      )
    const [hardRow] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, hard.id))
    expect(softRow.id).toBe(soft.id)
    expect(hardRow).toBeUndefined()
  })

  it('loads messages ascending with generation runs and enforces ownership', async () => {
    const { getMessagesCore } = await import(
      '../../src/server/functions/messages'
    )
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
})
