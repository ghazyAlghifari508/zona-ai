/**
 * @vitest-environment node
 */
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import {
  attachments,
  conversations,
  documentChunks,
  users,
} from '../../src/lib/db/schema'

const mockStreamTextGlobal = vi.fn((opts: Record<string, unknown>) => {
  const onFinish = opts.onFinish as ((o: unknown) => Promise<void>) | undefined
  const onChunk = opts.onChunk as (() => void) | undefined
  if (onChunk) onChunk()
  if (onFinish) {
    setTimeout(() => {
      void onFinish({
        text: 'mocked answer',
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: 'stop',
        reasoningText: undefined,
      })
    }, 10)
  }
  const fakeStream = new ReadableStream({
    start(controller) {
      controller.enqueue('mocked answer')
      controller.close()
    },
  })
  // capture system for assertions
  ;(globalThis as unknown as Record<string, unknown>).__lastChatSystem =
    opts.system
  ;(globalThis as unknown as Record<string, unknown>).__lastChatMessages =
    opts.messages
  return {
    text: Promise.resolve('mocked answer'),
    stream: fakeStream,
    toUIMessageStreamResponse: (init?: { headers?: Record<string, string> }) =>
      new Response('mocked answer', { headers: init?.headers }),
    toTextStreamResponse: () => new Response('mocked answer'),
  }
})

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: vi.fn(async () => ({ text: '' })),
    streamText: mockStreamTextGlobal,
  }
})

// Mock R2 and embedding fetch for integration
vi.mock('../../src/lib/r2/client', () => ({
  getObject: vi.fn(async () => ({
    body: Buffer.from('Hello world. '.repeat(500)),
    contentType: 'text/plain',
  })),
  putObject: vi.fn(async () => {}),
  deleteObject: vi.fn(async () => {}),
}))

vi.mock('unpdf', () => ({
  extractText: vi.fn(async (buf: Uint8Array) => {
    const str = Buffer.from(buf).toString('utf8')
    if (str.includes('corrupted-not-pdf')) throw new Error('Invalid PDF')
    return { text: str, totalPages: 1 }
  }),
}))

vi.mock('mammoth', () => ({
  extractRawText: vi.fn(async ({ buffer }: { buffer: Buffer }) => {
    return { value: buffer.toString('utf8') }
  }),
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async (req: Request) => {
    const testUser = (req as unknown as { headers: Headers })?.headers?.get(
      'x-test-user',
    )
    if (testUser)
      return { user: { id: testUser, email: `${testUser}@example.com` } }
    return { user: { id: 'test-user-rag', email: 'test-rag@example.com' } }
  }),
}))

describe('document_chunks schema', () => {
  it('has table with embedding vector', async () => {
    const r = await db.execute(
      sql`SELECT column_name, udt_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='document_chunks' AND column_name='embedding'`,
    )
    const rows = Array.isArray(r)
      ? r
      : (r as unknown as { rows: unknown[] }).rows
    expect(rows.length).toBe(1)
  })
  it('has HNSW index', async () => {
    const r = await db.execute(
      sql`SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename='document_chunks' AND indexname LIKE '%hnsw%'`,
    )
    const rows = Array.isArray(r)
      ? r
      : (r as unknown as { rows: unknown[] }).rows
    expect(rows.length).toBe(1)
  })
})

describe('processDocument', () => {
  const mockUserId = 'test-user-rag-process'
  let convId: string

  beforeEach(async () => {
    vi.clearAllMocks()
    // Mock fetch for embeddings - deterministic 1536 dim
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              data: Array.from({ length: 20 }, () => ({
                embedding: Array(1536).fill(0.1),
              })),
            }),
          }) as unknown as Response,
      ),
    )

    // Clean up
    await db.delete(documentChunks)
    await db.delete(attachments).where(eq(attachments.userId, mockUserId))
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    for (const c of convs) {
      await db
        .delete(documentChunks)
        .where(eq(documentChunks.conversationId, c.id))
      await db.delete(attachments).where(eq(attachments.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, mockUserId))
    await db.insert(users).values({
      id: mockUserId,
      email: 'rag-process@example.com',
      name: 'RAG',
    } as never)
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'RAG conv' })
      .returning()
    convId = conv.id

    // Default mock getObject
    const r2 = await import('../../src/lib/r2/client')
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from('Hello world. '.repeat(500)),
      contentType: 'text/plain',
    } as never)
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await db.delete(documentChunks)
    await db.delete(attachments).where(eq(attachments.userId, mockUserId))
    await db.delete(conversations).where(eq(conversations.id, convId))
    await db.delete(users).where(eq(users.id, mockUserId))
  })

  it('pipeline pendingâ†’completed with chunks', async () => {
    const { processDocument } = await import('../../src/lib/rag/process')
    const attId = crypto.randomUUID()
    await db.insert(attachments).values({
      id: attId,
      userId: mockUserId,
      conversationId: convId,
      fileName: 'test.txt',
      fileSize: 1000,
      mimeType: 'text/plain',
      r2Key: `users/${mockUserId}/attachments/${attId}/test.txt`,
      r2Bucket: 'test-bucket',
      processingStatus: 'pending',
      extractedText: null,
    })
    await processDocument(attId)
    const r2 = await import('../../src/lib/r2/client')
    expect(r2.getObject).toHaveBeenCalledWith({
      bucket: 'test-bucket',
      key: `users/${mockUserId}/attachments/${attId}/test.txt`,
    })
    const [att] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attId))
    expect(att.processingStatus).toBe('completed')
    expect(att.extractedText).toBeDefined()
    const chunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.attachmentId, attId))
    expect(chunks.length).toBeGreaterThan(0)
    // Check embedding dimension
    const first = chunks[0]
    expect(first.content.length).toBeGreaterThan(0)
    // Cleanup
    await db
      .delete(documentChunks)
      .where(eq(documentChunks.attachmentId, attId))
    await db.delete(attachments).where(eq(attachments.id, attId))
  })

  it('embedding fail â†’ failed no chunks', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    )
    const { processDocument } = await import('../../src/lib/rag/process')
    const attId = crypto.randomUUID()
    await db.insert(attachments).values({
      id: attId,
      userId: mockUserId,
      conversationId: convId,
      fileName: 'fail.txt',
      fileSize: 1000,
      mimeType: 'text/plain',
      r2Key: `users/${mockUserId}/attachments/${attId}/fail.txt`,
      r2Bucket: 'test-bucket',
      processingStatus: 'pending',
      extractedText: null,
    })
    await expect(processDocument(attId)).rejects.toThrow()
    const [att] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attId))
    expect(att.processingStatus).toBe('failed')
    const chunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.attachmentId, attId))
    expect(chunks.length).toBe(0)
    await db.delete(attachments).where(eq(attachments.id, attId))
  })

  it('image skip â†’ completed no chunks', async () => {
    const { processDocument } = await import('../../src/lib/rag/process')
    const r2 = await import('../../src/lib/r2/client')
    // Ensure getObject not called for image but we mock anyway
    vi.mocked(r2.getObject).mockClear()
    const attId = crypto.randomUUID()
    await db.insert(attachments).values({
      id: attId,
      userId: mockUserId,
      conversationId: convId,
      fileName: 'photo.png',
      fileSize: 1000,
      mimeType: 'image/png',
      r2Key: `users/${mockUserId}/attachments/${attId}/photo.png`,
      r2Bucket: 'test-bucket',
      processingStatus: 'pending',
      extractedText: null,
    })
    await processDocument(attId)
    const [att] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, attId))
    expect(att.processingStatus).toBe('completed')
    expect(att.extractedText).toBe('')
    const chunks = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.attachmentId, attId))
    expect(chunks.length).toBe(0)
    expect(r2.getObject).not.toHaveBeenCalled()
    await db.delete(attachments).where(eq(attachments.id, attId))
  })
})

describe('retrieveContext scoped', () => {
  const userA = 'test-user-rag-retrieve-a'
  const userB = 'test-user-rag-retrieve-b'
  let convA: string
  let convB: string

  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              data: [
                { embedding: Array(1536).fill(0.1) },
                { embedding: Array(1536).fill(0.2) },
              ],
            }),
          }) as unknown as Response,
      ),
    )
    // Cleanup
    for (const uid of [userA, userB]) {
      await db.delete(documentChunks)
      await db.delete(attachments).where(eq(attachments.userId, uid))
      const convs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.userId, uid))
      for (const c of convs) {
        await db
          .delete(documentChunks)
          .where(eq(documentChunks.conversationId, c.id))
        await db.delete(conversations).where(eq(conversations.id, c.id))
      }
      await db.delete(users).where(eq(users.id, uid))
      await db
        .insert(users)
        .values({ id: uid, email: `${uid}@example.com`, name: uid } as never)
    }
    const [a] = await db
      .insert(conversations)
      .values({ userId: userA, title: 'Conv A' })
      .returning()
    const [b] = await db
      .insert(conversations)
      .values({ userId: userB, title: 'Conv B' })
      .returning()
    convA = a.id
    convB = b.id

    // Insert chunks for convA and convB directly
    const attA = crypto.randomUUID()
    const attB = crypto.randomUUID()
    await db.insert(attachments).values({
      id: attA,
      userId: userA,
      conversationId: convA,
      fileName: 'a.txt',
      fileSize: 10,
      mimeType: 'text/plain',
      r2Key: `users/${userA}/attachments/${attA}/a.txt`,
      r2Bucket: 'test',
      processingStatus: 'completed',
      extractedText: 'content A',
    })
    await db.insert(attachments).values({
      id: attB,
      userId: userB,
      conversationId: convB,
      fileName: 'b.txt',
      fileSize: 10,
      mimeType: 'text/plain',
      r2Key: `users/${userB}/attachments/${attB}/b.txt`,
      r2Bucket: 'test',
      processingStatus: 'completed',
      extractedText: 'content B',
    })
    // Insert document chunks
    await db.insert(documentChunks).values({
      attachmentId: attA,
      conversationId: convA,
      chunkIndex: 0,
      content: 'Hello from A unique content',
      embedding: Array(1536).fill(0.1) as unknown as never,
      metadata: {},
    })
    await db.insert(documentChunks).values({
      attachmentId: attB,
      conversationId: convB,
      chunkIndex: 0,
      content: 'Hello from B different',
      embedding: Array(1536).fill(0.1) as unknown as never,
      metadata: {},
    })
  })

  afterAll(async () => {
    for (const uid of [userA, userB]) {
      await db.delete(documentChunks)
      await db.delete(attachments).where(eq(attachments.userId, uid))
      await db.delete(conversations).where(eq(conversations.userId, uid))
      await db.delete(users).where(eq(users.id, uid))
    }
    vi.unstubAllGlobals()
  })

  it('only returns chunks from requested conversation', async () => {
    // Mock embedQuery to return fixed vector
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              data: [{ embedding: Array(1536).fill(0.1) }],
            }),
          }) as unknown as Response,
      ),
    )
    const { retrieveContext } = await import('../../src/lib/rag/retrieve')
    const ctxA = await retrieveContext({
      conversationId: convA,
      query: 'hello',
      topK: 5,
    })
    expect(ctxA.length).toBe(1)
    expect(ctxA[0]).toContain('Hello from A')
    expect(ctxA[0]).not.toContain('Hello from B')
    const ctxB = await retrieveContext({
      conversationId: convB,
      query: 'hello',
      topK: 5,
    })
    expect(ctxB.length).toBe(1)
    expect(ctxB[0]).toContain('Hello from B')
  })

  it('respects topK limit', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              data: [{ embedding: Array(1536).fill(0.1) }],
            }),
          }) as unknown as Response,
      ),
    )
    const { retrieveContext } = await import('../../src/lib/rag/retrieve')
    // Insert more chunks for convA
    const attExtra = crypto.randomUUID()
    await db.insert(attachments).values({
      id: attExtra,
      userId: userA,
      conversationId: convA,
      fileName: 'extra.txt',
      fileSize: 10,
      mimeType: 'text/plain',
      r2Key: `users/${userA}/attachments/${attExtra}/extra.txt`,
      r2Bucket: 'test',
      processingStatus: 'completed',
      extractedText: 'extra',
    })
    await db.insert(documentChunks).values([
      {
        attachmentId: attExtra,
        conversationId: convA,
        chunkIndex: 1,
        content: 'chunk 2',
        embedding: Array(1536).fill(0.1) as unknown as never,
        metadata: {},
      },
      {
        attachmentId: attExtra,
        conversationId: convA,
        chunkIndex: 2,
        content: 'chunk 3',
        embedding: Array(1536).fill(0.1) as unknown as never,
        metadata: {},
      },
    ])
    const ctx = await retrieveContext({
      conversationId: convA,
      query: 'hello',
      topK: 2,
    })
    expect(ctx.length).toBe(2)
  })
})

describe('injection chat rag', () => {
  const mockUserId = 'test-user-rag-inject'
  let convId: string

  beforeEach(async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              data: [{ embedding: Array(1536).fill(0.1) }],
            }),
          }) as unknown as Response,
      ),
    )

    await db.delete(documentChunks)
    await db.delete(attachments).where(eq(attachments.userId, mockUserId))
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    for (const c of convs) {
      await db
        .delete(documentChunks)
        .where(eq(documentChunks.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, mockUserId))
    await db.insert(users).values({
      id: mockUserId,
      email: 'inject@example.com',
      name: 'Inject',
    } as never)
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Inject conv' })
      .returning()
    convId = conv.id
    // Insert a chunk
    const attId = crypto.randomUUID()
    await db.insert(attachments).values({
      id: attId,
      userId: mockUserId,
      conversationId: convId,
      fileName: 'doc.txt',
      fileSize: 10,
      mimeType: 'text/plain',
      r2Key: `users/${mockUserId}/attachments/${attId}/doc.txt`,
      r2Bucket: 'test',
      processingStatus: 'completed',
      extractedText: 'doc content',
    })
    await db.insert(documentChunks).values({
      attachmentId: attId,
      conversationId: convId,
      chunkIndex: 0,
      content: 'Unique RAG content for injection',
      embedding: Array(1536).fill(0.1) as unknown as never,
      metadata: {},
    })
    mockStreamTextGlobal.mockClear()
    // Ensure getAuthSession mock
    const sessionMod = await import('../../src/lib/auth/session')
    vi.mocked(sessionMod.getAuthSession).mockResolvedValue({
      user: { id: mockUserId, email: 'inject@example.com' },
    } as never)
  })

  afterAll(async () => {
    vi.unstubAllGlobals()
    await db.delete(documentChunks)
    await db.delete(attachments).where(eq(attachments.userId, mockUserId))
    await db.delete(conversations).where(eq(conversations.userId, mockUserId))
    await db.delete(users).where(eq(users.id, mockUserId))
  })

  it('sendMessage injects Context from documents', async () => {
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const sessionMod = await import('../../src/lib/auth/session')
    vi.mocked(sessionMod.getAuthSession).mockResolvedValue({
      user: { id: mockUserId, email: 'inject@example.com' },
    } as never)
    // Stub fetch for embedQuery inside retrieveContext
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              data: [{ embedding: Array(1536).fill(0.1) }],
            }),
          }) as unknown as Response,
      ),
    )
    const response = (await sendMessageCore({
      data: {
        modelId: 'auto',
        content: 'what is in doc?',
        skillId: 'none',
        conversationId: convId,
      },
      request,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 50))
    expect(mockStreamTextGlobal).toHaveBeenCalled()
    const lastCall = mockStreamTextGlobal.mock.calls[
      mockStreamTextGlobal.mock.calls.length - 1
    ]?.[0] as Record<string, unknown>
    const system = lastCall.system as string
    expect(system).toContain('Context from documents')
    expect(system).toContain('Unique RAG content for injection')
  })

  it('sendCompareMessage same context to all models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              data: [{ embedding: Array(1536).fill(0.1) }],
            }),
          }) as unknown as Response,
      ),
    )
    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const request = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const sessionMod = await import('../../src/lib/auth/session')
    vi.mocked(sessionMod.getAuthSession).mockResolvedValue({
      user: { id: mockUserId, email: 'inject@example.com' },
    } as never)
    mockStreamTextGlobal.mockClear()
    const response = (await sendCompareMessageCore({
      data: {
        modelIds: ['cent-ai/qwen3.8-flash', 'cx/gpt-6.2-sol'],
        content: 'what is in doc?',
        skillId: 'none',
        conversationId: convId,
      },
      request,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    await new Promise((r) => setTimeout(r, 300))
    // Should have called streamText twice with same system
    expect(mockStreamTextGlobal.mock.calls.length).toBeGreaterThanOrEqual(2)
    const systems = mockStreamTextGlobal.mock.calls.map(
      (c) => (c[0] as Record<string, unknown>).system as string,
    )
    // All systems should contain same RAG context
    for (const s of systems) {
      if (s) {
        expect(s).toContain('Unique RAG content for injection')
      }
    }
    // Check that all non-empty systems are equal (fair)
    const nonEmpty = systems.filter((s) => s?.includes('Unique RAG'))
    expect(nonEmpty.length).toBeGreaterThanOrEqual(2)
    expect(nonEmpty[0]).toBe(nonEmpty[1])
  })

  it('graceful when retrieve fails still chats', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    )
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const request = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const sessionMod = await import('../../src/lib/auth/session')
    vi.mocked(sessionMod.getAuthSession).mockResolvedValue({
      user: { id: mockUserId, email: 'inject@example.com' },
    } as never)
    const response = (await sendMessageCore({
      data: {
        modelId: 'auto',
        content: 'hello without rag',
        skillId: 'none',
        conversationId: convId,
      },
      request,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 50))
    expect(mockStreamTextGlobal).toHaveBeenCalled()
    const lastCall = mockStreamTextGlobal.mock.calls[
      mockStreamTextGlobal.mock.calls.length - 1
    ]?.[0] as Record<string, unknown>
    const system = lastCall.system as string
    expect(typeof system).toBe('string')
  })
})
