/**
 * @vitest-environment node
 */

import { and, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import {
  conversations,
  creditTransactions,
  generationRuns,
  messages,
  usageRecords,
  users,
} from '../../src/lib/db/schema'

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: vi.fn((opts: Record<string, unknown>) => {
      const onFinish = opts.onFinish as
        | ((o: unknown) => Promise<void>)
        | undefined
      const onChunk = opts.onChunk as (() => void) | undefined
      const fakeText = 'Hello mocked response'
      const fakeUsage = { inputTokens: 5, outputTokens: 10, totalTokens: 15 }
      if (onChunk) onChunk()
      if (onFinish) {
        setTimeout(() => {
          void onFinish({
            text: fakeText,
            usage: fakeUsage,
            finishReason: 'stop',
            reasoningText: undefined,
          })
        }, 20)
      }
      const fakeStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Hello mocked ')
          controller.enqueue('response')
          controller.close()
        },
      })
      return {
        text: Promise.resolve(fakeText),
        stream: fakeStream,
        toUIMessageStreamResponse: (init?: {
          headers?: Record<string, string>
        }) => {
          return new Response(fakeText, { headers: init?.headers })
        },
        toTextStreamResponse: () => new Response(fakeText),
      }
    }),
  }
})

const mockUserId = 'test-user-chat'
const mockUserId2 = 'test-user-chat-2'

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async (req: Request) => {
    // Default to mockUserId, but we can inspect request headers to decide? For now return mockUserId
    // If test sets header x-test-user, use that
    const testUser = (req as unknown as { headers: Headers })?.headers?.get(
      'x-test-user',
    )
    if (testUser)
      return { user: { id: testUser, email: `${testUser}@example.com` } }
    return { user: { id: mockUserId, email: 'test1@example.com' } }
  }),
}))

describe('generation_runs schema', () => {
  it('has generation_runs table', async () => {
    const r = await db.execute(
      sql`SELECT to_regclass('public.generation_runs') as cls`,
    )
    const rows = Array.isArray(r)
      ? r
      : (r as unknown as { rows: unknown[] }).rows
    const val = (rows[0] as { cls: string | null }).cls
    expect(val).toBe('generation_runs')
  })
  it('has credit_transactions table', async () => {
    const r = await db.execute(
      sql`SELECT to_regclass('public.credit_transactions') as cls`,
    )
    const rows = Array.isArray(r)
      ? r
      : (r as unknown as { rows: unknown[] }).rows
    const val = (rows[0] as { cls: string | null }).cls
    expect(val).toBe('credit_transactions')
  })
  it('has usage_records table', async () => {
    const r = await db.execute(
      sql`SELECT to_regclass('public.usage_records') as cls`,
    )
    const rows = Array.isArray(r)
      ? r
      : (r as unknown as { rows: unknown[] }).rows
    const val = (rows[0] as { cls: string | null }).cls
    expect(val).toBe('usage_records')
  })
})

describe('sendMessage integration', () => {
  beforeEach(async () => {
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, mockUserId))
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, mockUserId2))
    await db.delete(usageRecords).where(eq(usageRecords.userId, mockUserId))
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    for (const c of convs) {
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    const convs2 = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId2))
    for (const c of convs2) {
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, mockUserId))
    await db.delete(users).where(eq(users.id, mockUserId2))

    await db.insert(users).values({
      id: mockUserId,
      email: 'test1@example.com',
      name: 'Test1',
      credits: 100,
    } as never)
    await db.insert(users).values({
      id: mockUserId2,
      email: 'test2@example.com',
      name: 'Test2',
      credits: 100,
    } as never)
    vi.clearAllMocks()
  })

  afterAll(async () => {
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, mockUserId))
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, mockUserId2))
    await db.delete(usageRecords).where(eq(usageRecords.userId, mockUserId))
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    for (const c of convs) {
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    const convs2 = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId2))
    for (const c of convs2) {
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, mockUserId))
    await db.delete(users).where(eq(users.id, mockUserId2))
  })

  it('deducts 4 for auto reasoning + creates generation_runs', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    // Import and re-mock getAuthSession to return mockUserId for this request
    const sessionMod = await import('../../src/lib/auth/session')
    vi.mocked(sessionMod.getAuthSession).mockResolvedValueOnce({
      user: { id: mockUserId, email: 'test1@example.com' },
    } as never)
    const response = (await sendMessageCore({
      data: {
        modelId: 'auto',
        content: 'selesaikan persamaan x^2+3x=10 langkah demi langkah',
        skillId: 'none',
      },
      request,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 120))
    // Scope to this test user's conversations (parallel suites also insert auto runs)
    const myConvs = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    const myConvIds = myConvs.map((c) => c.id)
    const gens = await db
      .select()
      .from(generationRuns)
      .where(
        and(
          eq(generationRuns.modelId, 'auto'),
          inArray(generationRuns.conversationId, myConvIds),
        ),
      )
    expect(gens.length).toBeGreaterThan(0)
    const gen = gens[gens.length - 1]
    expect(gen.status).toBe('completed')
    expect(gen.routerModelId).toBe('ag/gemini-3.7-flash-high')
    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, mockUserId))
    const usageTx = txs.find((t) => t.amount === -4)
    expect(usageTx).toBeDefined()
    expect(usageTx?.balanceAfter).toBe(96)
    const [user] = await db.select().from(users).where(eq(users.id, mockUserId))
    expect(user.credits).toBe(96)
  })

  it('throws 402 if insufficient for premium', async () => {
    await db.update(users).set({ credits: 0 }).where(eq(users.id, mockUserId))
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const sessionMod = await import('../../src/lib/auth/session')
    vi.mocked(sessionMod.getAuthSession).mockResolvedValueOnce({
      user: { id: mockUserId, email: 'test1@example.com' },
    } as never)
    await expect(
      sendMessageCore({
        data: {
          modelId: 'gpt-5.6-sol',
          content: 'hello premium',
          skillId: 'none',
        },
        request,
      }) as unknown as Promise<Response>,
    ).rejects.toMatchObject({ status: 402 })
    const [user] = await db.select().from(users).where(eq(users.id, mockUserId))
    expect(user.credits).toBe(0)
  })

  it('throws 403 if accessing other user conversation', async () => {
    const [conv] = await db
      .insert(conversations)
      .values({
        id: crypto.randomUUID(),
        userId: mockUserId2,
        title: 'other user conv',
      } as never)
      .returning()
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const sessionMod = await import('../../src/lib/auth/session')
    vi.mocked(sessionMod.getAuthSession).mockResolvedValueOnce({
      user: { id: mockUserId, email: 'test1@example.com' },
    } as never)
    await expect(
      sendMessageCore({
        data: {
          modelId: 'auto',
          content: 'halo',
          skillId: 'none',
          conversationId: conv.id,
        },
        request,
      }) as unknown as Promise<Response>,
    ).rejects.toMatchObject({ status: 403 })
  })

  it('auto-titles a new conversation and advances updatedAt', async () => {
    const previousUpdatedAt = new Date('2026-01-01T00:00:00Z')
    const [conversation] = await db
      .insert(conversations)
      .values({
        userId: mockUserId,
        title: 'New Chat',
        updatedAt: previousUpdatedAt,
      })
      .returning()
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const response = await sendMessageCore({
      data: {
        conversationId: conversation.id,
        modelId: 'auto',
        content: 'Judul otomatis\nbaris kedua',
        skillId: 'none',
      },
      request,
    })
    await response.text()
    const [updated] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id))

    expect(updated.title).toBe('Judul otomatis')
    expect(updated.updatedAt?.getTime()).toBeGreaterThan(
      previousUpdatedAt.getTime(),
    )
  })

  it('regenerates with the original response model as a text stream', async () => {
    const [conversation] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Regenerate' })
      .returning()
    await db.insert(messages).values({
      conversationId: conversation.id,
      role: 'user',
      content: 'Original prompt',
    })
    const [assistant] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: 'assistant',
        content: 'Original answer',
      })
      .returning()
    await db.insert(generationRuns).values({
      messageId: assistant.id,
      conversationId: conversation.id,
      modelId: 'gemini-3.7-flash-high',
      routerModelId: 'ag/gemini-3.7-flash-high',
      status: 'completed',
    })
    const { regenerateMessageCore } = await import('../../src/server/core/chat')

    const response = await regenerateMessageCore({
      messageId: assistant.id,
      request: new Request('http://localhost:3000', {
        headers: { 'x-test-user': mockUserId },
      }),
    })

    expect(response.headers.get('Content-Type')).toContain('text/plain')
    await response.text()
    const runs = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.conversationId, conversation.id))
    expect(runs.at(-1)?.modelId).toBe('gemini-3.7-flash-high')
  })

  it('getModels returns 3', async () => {
    const { getModelsCore } = await import('../../src/server/core/models')
    const request = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const sessionMod = await import('../../src/lib/auth/session')
    vi.mocked(sessionMod.getAuthSession).mockResolvedValueOnce({
      user: { id: mockUserId, email: 'test1@example.com' },
    } as never)
    const models = (await getModelsCore({ request })) as unknown as unknown[]
    expect(models.length).toBe(3)
  })
})
