/**
 * @vitest-environment node
 *
 * Performance â€” internal TTFT < 150ms measured with real Date.now()
 * against a mocked 9Router stream with no network delay (spec Â§6).
 */

import { eq, inArray } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import {
  conversations,
  generationRuns,
  messages,
  users,
} from '../../src/lib/db/schema'

const perfUserId = 'perf-test-user'

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: vi.fn((opts: Record<string, unknown>) => {
      const onFinish = opts.onFinish as
        | ((o: unknown) => Promise<void>)
        | undefined
      const onChunk = opts.onChunk as (() => void) | undefined
      // Immediate first chunk â€” no network delay
      if (onChunk) onChunk()
      if (onFinish) {
        void onFinish({
          text: 'Hello perf',
          usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
          finishReason: 'stop',
          reasoningText: undefined,
        })
      }
      const fakeStream = new ReadableStream({
        start(controller) {
          controller.enqueue('Hello perf')
          controller.close()
        },
      })
      return {
        text: Promise.resolve('Hello perf'),
        stream: fakeStream,
        toUIMessageStreamResponse: (init?: {
          headers?: Record<string, string>
        }) => new Response('Hello perf', { headers: init?.headers }),
        toTextStreamResponse: () => new Response('Hello perf'),
      }
    }),
  }
})

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: perfUserId, email: 'perf@example.com' },
  })),
}))

describe('performance â€” internal TTFT < 150ms (NFR-001)', () => {
  beforeEach(async () => {
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, perfUserId))
    for (const c of convs) {
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, perfUserId))
    await db.insert(users).values({
      id: perfUserId,
      email: 'perf@example.com',
      name: 'Perf',
      credits: 100,
    })
  })

  afterAll(async () => {
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, perfUserId))
    for (const c of convs) {
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, perfUserId))
  })

  it('firstTokenAt is measured synchronously in onChunk â€” TTFT < 150ms', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const startedAtMs = Date.now()
    const response = (await sendMessageCore({
      data: { modelId: 'auto', content: 'hello perf test', skillId: 'none' },
      request: new Request('http://localhost:3000'),
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 150))

    const perfConvs = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, perfUserId))
    const gen = await db
      .select()
      .from(generationRuns)
      .where(
        inArray(
          generationRuns.conversationId,
          perfConvs.map((c) => c.id),
        ),
      )
      .orderBy(generationRuns.startedAt)
      .then((rows) => rows[rows.length - 1] as (typeof rows)[number])

    expect(gen).toBeDefined()
    expect(gen.status).toBe('completed')
    // Internal TTFT (firstTokenAt - startTime) must be real and < 150ms
    expect(gen.timeToFirstTokenMs).not.toBeNull()
    expect(gen.timeToFirstTokenMs).toBeLessThan(150)
    // Overall call duration sanity (no fake setTimeout measurement)
    expect(Date.now() - startedAtMs).toBeLessThan(10_000)
  })

  it('latencyMs recorded and latency >= TTFT', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const response = (await sendMessageCore({
      data: { modelId: 'auto', content: 'hello perf test 2', skillId: 'none' },
      request: new Request('http://localhost:3000'),
    })) as unknown as Response
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 150))

    const perfConvs = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(eq(conversations.userId, perfUserId))
    const gen = await db
      .select()
      .from(generationRuns)
      .where(
        inArray(
          generationRuns.conversationId,
          perfConvs.map((c) => c.id),
        ),
      )
      .orderBy(generationRuns.startedAt)
      .then((rows) => rows[rows.length - 1] as (typeof rows)[number])

    expect(gen.latencyMs).not.toBeNull()
    expect(gen.latencyMs).toBeGreaterThanOrEqual(gen.timeToFirstTokenMs ?? 0)
  })
})
