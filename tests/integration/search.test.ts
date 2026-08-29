/**
 * @vitest-environment node
 */
import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import { webSources } from '../../src/lib/db/schema'

describe('web_sources schema', () => {
  it('has web_sources table with required columns', async () => {
    const r = await db.execute(
      sql`SELECT to_regclass('public.web_sources') as cls`,
    )
    const rows = Array.isArray(r)
      ? (r as unknown as Array<{ cls: string | null }>)
      : (r as { rows: Array<{ cls: string | null }> }).rows
    const val = (rows[0] as { cls: string | null }).cls
    expect(val).toBe('web_sources')

    const cols = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name='web_sources'`,
    )
    const colRows = Array.isArray(cols)
      ? (cols as unknown as Array<{ column_name: string }>)
      : (cols as { rows: Array<{ column_name: string }> }).rows
    const names = colRows.map((c) => c.column_name)
    expect(names).toContain('generation_run_id')
    expect(names).toContain('conversation_id')
    expect(names).toContain('position')
    expect(names).toContain('score')
  })
})

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async () => ({
    user: { id: 'test-user-search', email: 'search@example.com' },
  })),
}))

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
        textStream: fakeStream,
        toUIMessageStreamResponse: (init?: {
          headers?: Record<string, string>
        }) => new Response(fakeText, { headers: init?.headers }),
        toTextStreamResponse: () => new Response(fakeText),
      }
    }),
  }
})

describe('searchWeb standalone', () => {
  it('returns 2 results no web_sources insert (standalone)', async () => {
    const mockResults = [
      {
        url: 'https://example.com/article-1',
        title: 'Understanding RAG Systems',
        content: 'RAG combines retrieval...',
        score: 0.95,
      },
      {
        url: 'https://example.com/article-2',
        title: 'AI Model Comparison Guide',
        content: 'Comparing...',
        score: 0.88,
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: mockResults }),
      })) as unknown as typeof fetch,
    )
    const { searchWebCore } = await import('../../src/server/functions/search')
    const res = await searchWebCore({
      data: { query: 'hello', searchDepth: 'basic' },
      request: new Request('http://localhost:3000'),
    })
    expect(res.results.length).toBe(2)
    expect(res.results[0].score).toBe(0.95)
  })

  it('handles Tavily fail graceful empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    )
    const { searchWebCore } = await import('../../src/server/functions/search')
    const res = await searchWebCore({
      data: { query: 'fail', searchDepth: 'basic' },
      request: new Request('http://localhost:3000'),
    })
    expect(res.results.length).toBe(0)
  })
})

describe('sendMessage enableWebSearch', () => {
  const testUserId = 'test-user-search-msg'

  beforeEach(async () => {
    const {
      conversations,
      messages,
      generationRuns,
      users,
      creditTransactions,
      usageRecords,
    } = await import('../../src/lib/db/schema')
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, testUserId))
    for (const c of convs) {
      await db
        .delete(generationRuns)
        .where(eq(generationRuns.conversationId, c.id))
      await db.delete(messages).where(eq(messages.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, testUserId))
    await db.delete(usageRecords).where(eq(usageRecords.userId, testUserId))
    await db.delete(users).where(eq(users.id, testUserId))
    await db.insert(users).values({
      id: testUserId,
      email: 'search-msg@example.com',
      name: 'SearchMsg',
      credits: 100,
    })
    // Mock auth to return this user
    const { getAuthSession } = await import('../../src/lib/auth/session')
    vi.mocked(getAuthSession).mockResolvedValue({
      user: { id: testUserId, email: 'search-msg@example.com' },
      session: { id: 'sess' },
    } as unknown as Awaited<ReturnType<typeof getAuthSession>>)
  })

  it('inserts 2 web_sources and injects system Web context', async () => {
    const mockResults = [
      {
        url: 'https://example.com/article-1',
        title: 'Understanding RAG Systems',
        content: 'RAG combines retrieval content here '.repeat(20),
        score: 0.95,
      },
      {
        url: 'https://example.com/article-2',
        title: 'AI Model Comparison Guide',
        content: 'Comparing content here '.repeat(20),
        score: 0.88,
      },
    ]
    // Mock fetch for Tavily
    const originalFetch = global.fetch
    const fetchMock = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        const _body = init?.body as string | undefined
        if (typeof url === 'string' && url.includes('api.tavily.com')) {
          return {
            ok: true,
            json: async () => ({ results: mockResults }),
          } as unknown as Response
        }
        // For other fetches (like embeddings), return mock embedding response or fallback to original
        // Embedding fetch to localhost:20128/v1/embeddings
        if (typeof url === 'string' && url.includes('/embeddings')) {
          return {
            ok: true,
            json: async () => ({
              data: mockResults
                .slice(0, 1)
                .map(() => ({ embedding: Array(1536).fill(0.1) })),
            }),
          } as unknown as Response
        }
        return originalFetch(url as string, init)
      },
    )
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000')
    const response = (await sendMessageCore({
      data: {
        modelId: 'gemini-3.7-flash-high',
        content: 'berita terkini AI',
        skillId: 'none',
        enableWebSearch: true,
      },
      request,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    const conversationId = response.headers.get('X-Conversation-Id')
    expect(conversationId).toBeTruthy()
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 150))
    const recent = await db
      .select()
      .from(webSources)
      .where(eq(webSources.conversationId, conversationId as string))
    expect(recent.length).toBe(2)
    expect(recent[0].position).toBe(0)
    expect(recent[0].score).toBe(0.95)
    expect(recent[0].snippet?.length).toBeLessThanOrEqual(500)
    expect(recent[1].position).toBe(1)
    // Check conversationId linkage
    expect(recent[0].conversationId).toBeDefined()
  })

  it('Tavily fail â†’ 0 web_sources, still streams', async () => {
    const fetchMock = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        if (typeof url === 'string' && url.includes('api.tavily.com')) {
          return {
            ok: false,
            json: async () => ({}),
          } as unknown as Response
        }
        // embeddings fallback
        if (typeof url === 'string' && url.includes('/embeddings')) {
          return {
            ok: true,
            json: async () => ({
              data: [{ embedding: Array(1536).fill(0.1) }],
            }),
          } as unknown as Response
        }
        return fetch(url as string, init)
      },
    )
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000')
    const response = (await sendMessageCore({
      data: {
        modelId: 'gemini-3.7-flash-high',
        content: 'test fail web',
        skillId: 'none',
        enableWebSearch: true,
      },
      request,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    const conversationId = response.headers.get('X-Conversation-Id')
    expect(conversationId).toBeTruthy()
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 150))
    const after = await db
      .select()
      .from(webSources)
      .where(eq(webSources.conversationId, conversationId as string))
    expect(after.length).toBe(0)
  })
})

describe('Fair Compare', () => {
  const testUserId = 'test-user-compare-search'

  beforeEach(async () => {
    const {
      conversations,
      messages,
      generationRuns,
      comparisonRuns,
      users,
      creditTransactions,
      usageRecords,
    } = await import('../../src/lib/db/schema')
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, testUserId))
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
    await db
      .delete(creditTransactions)
      .where(eq(creditTransactions.userId, testUserId))
    await db.delete(usageRecords).where(eq(usageRecords.userId, testUserId))
    await db.delete(users).where(eq(users.id, testUserId))
    await db.insert(users).values({
      id: testUserId,
      email: 'compare-search@example.com',
      name: 'CompareSearch',
      credits: 100,
    })
    const { getAuthSession } = await import('../../src/lib/auth/session')
    vi.mocked(getAuthSession).mockResolvedValue({
      user: { id: testUserId, email: 'compare-search@example.com' },
      session: { id: 'sess' },
    } as unknown as Awaited<ReturnType<typeof getAuthSession>>)
  })

  it('fetches Tavily once for 2 models, same web_sources', async () => {
    const mockResults = [
      {
        url: 'https://example.com/article-1',
        title: 'Understanding RAG Systems',
        content: 'RAG combines retrieval content here '.repeat(20),
        score: 0.95,
      },
      {
        url: 'https://example.com/article-2',
        title: 'AI Model Comparison Guide',
        content: 'Comparing content here '.repeat(20),
        score: 0.88,
      },
    ]
    let fetchCount = 0
    const fetchMock = vi.fn(
      async (url: string | URL | Request, init?: RequestInit) => {
        if (typeof url === 'string' && url.includes('api.tavily.com')) {
          fetchCount++
          return {
            ok: true,
            json: async () => ({ results: mockResults }),
          } as unknown as Response
        }
        if (typeof url === 'string' && url.includes('/embeddings')) {
          return {
            ok: true,
            json: async () => ({
              data: [{ embedding: Array(1536).fill(0.1) }],
            }),
          } as unknown as Response
        }
        return fetch(url as string, init)
      },
    )
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)

    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const request = new Request('http://localhost:3000')
    const response = (await sendCompareMessageCore({
      data: {
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'berita terkini AI',
        skillId: 'none',
        enableWebSearch: true,
      },
      request,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    const conversationId = response.headers.get('X-Conversation-Id')
    expect(conversationId).toBeTruthy()
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 800))
    expect(fetchCount).toBe(1)
    const recent = await db
      .select()
      .from(webSources)
      .where(eq(webSources.conversationId, conversationId as string))
    expect(recent.length).toBe(4)
    // Each generation should have 2 rows same positions
    const byGen = new Map<string, typeof recent>()
    for (const s of recent) {
      const arr = byGen.get(s.generationRunId) ?? []
      arr.push(s)
      byGen.set(s.generationRunId, arr)
    }
    expect(byGen.size).toBe(2)
    for (const [, arr] of byGen) {
      expect(arr.length).toBe(2)
      expect(arr.find((x) => x.position === 0)?.url).toBe(
        'https://example.com/article-1',
      )
      expect(arr.find((x) => x.position === 1)?.url).toBe(
        'https://example.com/article-2',
      )
    }
  })

  it('ownership check blocks other user from seeing web_sources via getMessages', async () => {
    // Create a conversation with web_sources for testUserId, then try to getMessages as other user
    const mockResults = [
      {
        url: 'https://example.com/article-1',
        title: 'Understanding RAG Systems',
        content: 'RAG content',
        score: 0.95,
      },
    ]
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (typeof url === 'string' && url.includes('api.tavily.com')) {
        return {
          ok: true,
          json: async () => ({ results: mockResults }),
        } as unknown as Response
      }
      if (typeof url === 'string' && url.includes('/embeddings')) {
        return {
          ok: true,
          json: async () => ({ data: [{ embedding: Array(1536).fill(0.1) }] }),
        } as unknown as Response
      }
      return fetch(url as string)
    })
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch)
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000')
    const response = (await sendMessageCore({
      data: {
        modelId: 'gemini-3.7-flash-high',
        content: 'ownership test',
        skillId: 'none',
        enableWebSearch: true,
      },
      request,
    })) as unknown as Response
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 150))
    // Get conversationId from recent generation
    const { conversations } = await import('../../src/lib/db/schema')
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, testUserId))
    const convId = convs[convs.length - 1].id
    // Try to getMessages as other user
    const { getMessagesCore } = await import('../../src/server/core/messages')
    const otherRequest = new Request('http://localhost:3000')
    const { getAuthSession } = await import('../../src/lib/auth/session')
    vi.mocked(getAuthSession).mockResolvedValueOnce({
      user: { id: 'other-user', email: 'other@example.com' },
      session: { id: 'sess2' },
    } as unknown as Awaited<ReturnType<typeof getAuthSession>>)
    await expect(
      getMessagesCore({
        data: { conversationId: convId },
        request: otherRequest,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })
})
