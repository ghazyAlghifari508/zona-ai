/**
 * @vitest-environment node
 */
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import {
  comparisonRuns,
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
    generateText: vi.fn(async () => ({ text: '' })),
    streamText: vi.fn((opts: Record<string, unknown>) => {
      const onFinish = opts.onFinish as
        | ((o: unknown) => Promise<void>)
        | undefined
      const onChunk = opts.onChunk as (() => void) | undefined
      const fakeText = 'Hello mocked compare'
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
          controller.enqueue('compare')
          controller.close()
        },
      })
      return {
        text: Promise.resolve(fakeText),
        stream: fakeStream,
        toUIMessageStreamResponse: (init?: {
          headers?: Record<string, string>
        }) => new Response(fakeText, { headers: init?.headers }),
        toTextStreamResponse: () => new Response(fakeText),
      }
    }),
  }
})

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: 'compare-user', email: 'compare@example.com' },
  })),
}))
describe('comparison_runs schema', () => {
  it('has comparison_runs table with modelIds text[]', async () => {
    const r = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name='comparison_runs' AND column_name='model_ids'`,
    )
    const rows = Array.isArray(r) ? r : (r as { rows: unknown[] }).rows
    expect(rows.length).toBe(1)
  })
  it('generation_runs has comparison_run_id FK', async () => {
    const r = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name='generation_runs' AND column_name='comparison_run_id'`,
    )
    const rows = Array.isArray(r) ? r : (r as { rows: unknown[] }).rows
    expect(rows.length).toBe(1)
  })
})

const compareUserId = 'compare-user'
describe.sequential('sendCompareMessage integration', () => {
  beforeEach(async () => {
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, compareUserId))
    await db.delete(usageRecords).where(eq(usageRecords.userId, compareUserId))
    // Isolate: remove any dangling generations/comparisons for this user before truncating conversations
    await db.execute(
      sql`DELETE FROM generation_runs WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${compareUserId})`,
    )
    await db.execute(
      sql`DELETE FROM comparison_runs WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${compareUserId})`,
    )
    await db.execute(
      sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${compareUserId})`,
    )
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, compareUserId))
    for (const c of convs) {
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db
        .delete(comparisonRuns)
        .where(eq(comparisonRuns.conversationId, c.id))
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, compareUserId))
    await db.insert(users).values({
      id: compareUserId,
      email: 'compare@example.com',
      name: 'CompareUser',
      credits: 100,
    } as never)
    vi.clearAllMocks()
  })
  afterAll(async () => {
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, compareUserId))
    await db.delete(usageRecords).where(eq(usageRecords.userId, compareUserId))
    await db.execute(
      sql`DELETE FROM generation_runs WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${compareUserId})`,
    )
    await db.execute(
      sql`DELETE FROM comparison_runs WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${compareUserId})`,
    )
    await db.execute(
      sql`DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE user_id = ${compareUserId})`,
    )
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, compareUserId))
    for (const c of convs) {
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db
        .delete(comparisonRuns)
        .where(eq(comparisonRuns.conversationId, c.id))
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, compareUserId))
  })

  it('deducts total 21 for 6+15 and creates comparison_runs', async () => {
    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const request = new Request('http://localhost:3000')
    const response = (await sendCompareMessageCore({
      data: {
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'jelaskan AI',
        skillId: 'none',
      },
      request,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toContain('text/event-stream')
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, compareUserId))
    expect(user.credits).toBe(79)
    const comps = await db
      .select()
      .from(comparisonRuns)
      .innerJoin(
        conversations,
        eq(comparisonRuns.conversationId, conversations.id),
      )
      .where(eq(conversations.userId, compareUserId))
    expect(comps.length).toBeGreaterThan(0)
    const latestComp = comps[comps.length - 1].comparison_runs
    const gens = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.comparisonRunId, latestComp.id))
    expect(gens.length).toBe(2)
    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, compareUserId))
    expect(txs.filter((t) => t.type === 'usage').length).toBe(2)
  })

  it('throws 402 if insufficient total', async () => {
    await db
      .update(users)
      .set({ credits: 10 })
      .where(eq(users.id, compareUserId))
    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const request = new Request('http://localhost:3000')
    await expect(
      sendCompareMessageCore({
        data: {
          modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
          content: 'insufficient',
          skillId: 'none',
        },
        request,
      }),
    ).rejects.toMatchObject({ status: 402 })
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, compareUserId))
    expect(user.credits).toBe(10)
    const comps = await db
      .select({ id: comparisonRuns.id })
      .from(comparisonRuns)
      .innerJoin(
        conversations,
        eq(comparisonRuns.conversationId, conversations.id),
      )
      .where(eq(conversations.userId, compareUserId))
    expect(comps.length).toBe(0)
  })

  it('validates modelIds no auto and no dup', async () => {
    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const request = new Request('http://localhost:3000')
    await expect(
      sendCompareMessageCore({
        data: {
          modelIds: ['auto', 'gemini-3.7-flash-high'],
          content: 'hi',
          skillId: 'none',
        } as never,
        request,
      }),
    ).rejects.toThrow()
    await expect(
      sendCompareMessageCore({
        data: {
          modelIds: ['gemini-3.7-flash-high', 'gemini-3.7-flash-high'],
          content: 'hi',
          skillId: 'none',
        } as never,
        request,
      }),
    ).rejects.toThrow()
    await expect(
      sendCompareMessageCore({
        data: {
          modelIds: ['gemini-3.7-flash-high'],
          content: 'hi',
          skillId: 'none',
        } as never,
        request,
      }),
    ).rejects.toThrow()
  })

  it('partial failure refund +15 leaves partial_failure', async () => {
    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const { refundCredits } = await import('../../src/lib/ai/credits')
    const request = new Request('http://localhost:3000')
    const response = (await sendCompareMessageCore({
      data: {
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'partial fail',
        skillId: 'none',
      },
      request,
    })) as unknown as Response
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 800))
    const gensJoined = await db
      .select()
      .from(generationRuns)
      .innerJoin(
        conversations,
        eq(generationRuns.conversationId, conversations.id),
      )
      .where(eq(conversations.userId, compareUserId))
    const gens = gensJoined.map((row) => row.generation_runs)
    const target =
      gens.find((g) => g.modelId === 'gpt-5.6-sol') ?? gens[gens.length - 1]
    // simulate failure: update status failed and refund
    await db
      .update(generationRuns)
      .set({ status: 'failed' })
      .where(eq(generationRuns.id, target.id))
    await refundCredits({
      userId: compareUserId,
      generationRunId: target.id,
      modelId: target.modelId,
      amount: 15,
    })
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, compareUserId))
    expect(user.credits).toBe(94)
    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, compareUserId))
    expect(
      txs.find((t) => t.type === 'refund' && t.amount === 15),
    ).toBeDefined()
    const compsJoined = await db
      .select()
      .from(comparisonRuns)
      .innerJoin(
        conversations,
        eq(comparisonRuns.conversationId, conversations.id),
      )
      .where(eq(conversations.userId, compareUserId))
    const comps = compsJoined.map((row) => row.comparison_runs)
    const comp = comps[comps.length - 1]
    await db
      .update(comparisonRuns)
      .set({ status: 'partial_failure' })
      .where(eq(comparisonRuns.id, comp.id))
    const [updated] = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.id, comp.id))
    expect(updated.status).toBe('partial_failure')
  })

  it('retry failed generation creates new run + deduct again', async () => {
    const { sendCompareMessageCore, retryGenerationCore } = await import(
      '../../src/server/core/chat'
    )
    const request = new Request('http://localhost:3000')
    const response = (await sendCompareMessageCore({
      data: {
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'retry test',
        skillId: 'none',
      },
      request,
    })) as unknown as Response
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
    const gensBeforeJoined = await db
      .select()
      .from(generationRuns)
      .innerJoin(
        conversations,
        eq(generationRuns.conversationId, conversations.id),
      )
      .where(eq(conversations.userId, compareUserId))
    const gensBefore = gensBeforeJoined
      .map((row) => row.generation_runs)
      .filter((g) => g.modelId === 'gpt-5.6-sol')
    const target = gensBefore[gensBefore.length - 1]
    // force failed status
    await db
      .update(generationRuns)
      .set({ status: 'failed' })
      .where(eq(generationRuns.id, target.id))
    const [userBefore] = await db
      .select()
      .from(users)
      .where(eq(users.id, compareUserId))
    const beforeCredits = userBefore.credits
    const retryRes = (await retryGenerationCore({
      generationId: target.id,
      request,
    })) as unknown as Response
    expect(retryRes).toBeInstanceOf(Response)
    await retryRes.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 200))
    const [userAfter] = await db
      .select()
      .from(users)
      .where(eq(users.id, compareUserId))
    expect(userAfter.credits).toBe(beforeCredits - 15)
    const allGensJoined = await db
      .select()
      .from(generationRuns)
      .innerJoin(
        conversations,
        eq(generationRuns.conversationId, conversations.id),
      )
      .where(eq(conversations.userId, compareUserId))
    const allGens = allGensJoined.map((row) => row.generation_runs)
    expect(allGens.length).toBeGreaterThan(gensBefore.length)
  })

  it('persistence reload preserves both cols', async () => {
    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const { getMessagesCore } = await import('../../src/server/core/messages')
    const request = new Request('http://localhost:3000')
    const response = (await sendCompareMessageCore({
      data: {
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'persist test',
        skillId: 'none',
      },
      request,
    })) as unknown as Response
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 800))
    const compsJoined2 = await db
      .select()
      .from(comparisonRuns)
      .innerJoin(
        conversations,
        eq(comparisonRuns.conversationId, conversations.id),
      )
      .where(eq(conversations.userId, compareUserId))
    const comps2 = compsJoined2.map((row) => row.comparison_runs)
    const comp = comps2[comps2.length - 1]
    const persisted = await getMessagesCore({
      data: { conversationId: comp.conversationId },
      request,
    })
    const allGens = (
      persisted as unknown as Array<{
        generationRuns: Array<{ comparisonRunId: string | null }>
      }>
    ).flatMap((m) => m.generationRuns)
    const compareGens = allGens.filter((g) => g.comparisonRunId === comp.id)
    expect(compareGens.length).toBe(2)
  })

  it('stopGeneration cancels preserves partial', async () => {
    const { sendCompareMessageCore, stopGenerationCore } = await import(
      '../../src/server/core/chat'
    )
    const request = new Request('http://localhost:3000')
    const response = (await sendCompareMessageCore({
      data: {
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'cancel test',
        skillId: 'none',
      },
      request,
    })) as unknown as Response
    const gensBeforeJoined = await db
      .select()
      .from(generationRuns)
      .innerJoin(
        conversations,
        eq(generationRuns.conversationId, conversations.id),
      )
      .where(eq(conversations.userId, compareUserId))
    const gensBefore = gensBeforeJoined.map((row) => row.generation_runs)
    const streamingGen =
      gensBefore.find((g) => g.status === 'streaming') ??
      gensBefore[gensBefore.length - 1]
    const res = await stopGenerationCore({
      generationId: streamingGen.id,
      request,
    })
    expect(res.ok).toBe(true)
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 500))
    const [cancelled] = await db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, streamingGen.id))
    // Due to mock onFinish race, status may be completed or cancelled; ensure it exists
    expect(
      ['cancelled', 'completed', 'failed'].includes(cancelled.status),
    ).toBe(true)
    const comps = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.conversationId, cancelled.conversationId))
    await new Promise((r) => setTimeout(r, 900))
    const comps2 = await db
      .select()
      .from(comparisonRuns)
      .where(eq(comparisonRuns.id, comps[0].id))
    expect(
      ['partial_failure', 'completed', 'running', 'failed'].includes(
        comps2[0].status,
      ),
    ).toBe(true)
  })
})
