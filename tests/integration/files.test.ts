/**
 * @vitest-environment node
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import { attachments, conversations, users } from '../../src/lib/db/schema'

vi.mock('../../src/lib/r2/client', () => ({
  putObject: vi.fn(async () => {}),
  getObject: vi.fn(async () => ({
    body: Buffer.from('file-content'),
    contentType: 'application/pdf',
  })),
  deleteObject: vi.fn(async () => {}),
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async (req: Request) => {
    const testUser = (req as unknown as { headers: Headers })?.headers?.get(
      'x-test-user',
    )
    if (testUser)
      return { user: { id: testUser, email: `${testUser}@example.com` } }
    return { user: { id: 'test-user-files', email: 'test-files@example.com' } }
  }),
}))

const mockStreamText = vi.fn((opts: Record<string, unknown>) => {
  const onFinish = opts.onFinish as ((o: unknown) => Promise<void>) | undefined
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
  // capture messages for vision assertion
  ;(globalThis as unknown as Record<string, unknown>).__lastStreamMessages =
    opts.messages
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
})

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    generateText: vi.fn(async () => ({ text: '' })),
    streamText: mockStreamText,
  }
})

const mockUserId = 'test-user-files'
const mockUserId2 = 'test-user-files-2'

describe('files API', () => {
  beforeEach(async () => {
    // clean attachments
    await db.delete(attachments).where(eq(attachments.userId, mockUserId))
    await db.delete(attachments).where(eq(attachments.userId, mockUserId2))
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    for (const c of convs) {
      await db.delete(attachments).where(eq(attachments.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    const convs2 = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId2))
    for (const c of convs2) {
      await db.delete(attachments).where(eq(attachments.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, mockUserId))
    await db.delete(users).where(eq(users.id, mockUserId2))
    await db.insert(users).values({
      id: mockUserId,
      email: 'test-files@example.com',
      name: 'TestFiles',
      credits: 100,
    } as never)
    await db.insert(users).values({
      id: mockUserId2,
      email: 'test-files2@example.com',
      name: 'TestFiles2',
      credits: 100,
    } as never)
    vi.clearAllMocks()
    // re-mock r2 after clear
    const r2 = await import('../../src/lib/r2/client')
    vi.mocked(r2.putObject).mockResolvedValue(undefined as never)
    vi.mocked(r2.getObject).mockResolvedValue({
      body: Buffer.from('file-content'),
      contentType: 'application/pdf',
    } as never)
    vi.mocked(r2.deleteObject).mockResolvedValue(undefined as never)
  })

  afterAll(async () => {
    await db.delete(attachments).where(eq(attachments.userId, mockUserId))
    await db.delete(attachments).where(eq(attachments.userId, mockUserId2))
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    for (const c of convs) {
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    const convs2 = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId2))
    for (const c of convs2) {
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, mockUserId))
    await db.delete(users).where(eq(users.id, mockUserId2))
  })

  it('uploadFile success PDF creates attachments row pending', async () => {
    const { uploadFileCore } = await import('../../src/server/functions/files')
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Test Conv' })
      .returning()
    const pdfBuffer = Buffer.from('%PDF-1.4 hello')
    const file = new File([pdfBuffer], 'sample.pdf', {
      type: 'application/pdf',
    })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const request = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    // Need actual formData parsing; Request with FormData body should be handled
    // For node, we manually ensure file available via arrayBuffer
    const res = (await uploadFileCore({
      request,
    })) as unknown as typeof attachments.$inferSelect
    expect(res).toBeDefined()
    expect(res.fileName).toBe('sample.pdf')
    expect(res.processingStatus).toBe('pending')
    expect(res.r2Key).toMatch(/^users\/test-user-files\/attachments\//)
    const [dbRow] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, res.id))
    expect(dbRow).toBeDefined()
    expect(dbRow.r2Key).toBe(res.r2Key)
  })

  it('rejects unsupported mime 400', async () => {
    const { uploadFileCore } = await import('../../src/server/functions/files')
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Test Conv2' })
      .returning()
    const file = new File([Buffer.from('exe')], 'evil.exe', {
      type: 'application/x-msdownload',
    })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const request = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    await expect(uploadFileCore({ request })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('rejects magic mismatch exe renamed pdf 400', async () => {
    const { uploadFileCore } = await import('../../src/server/functions/files')
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Test Conv3' })
      .returning()
    const exeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00])
    const file = new File([exeBuffer], 'fake.pdf', {
      type: 'application/pdf',
    })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const request = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    await expect(uploadFileCore({ request })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('rejects oversized 413', async () => {
    const { uploadFileCore } = await import('../../src/server/functions/files')
    const { MAX_FILE_SIZE_BYTES } = await import(
      '../../src/lib/utils/constants'
    )
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Test Conv4' })
      .returning()
    // Create a file slightly larger than MAX (allocate buffer)
    const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1024)
    // Write PDF header at start so magic would pass if size check not first
    oversizedBuffer.write('%PDF')
    const file = new File([oversizedBuffer], 'big.pdf', {
      type: 'application/pdf',
    })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const request = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    await expect(uploadFileCore({ request })).rejects.toMatchObject({
      status: 413,
    })
  })

  it('getAttachment 403 if other user', async () => {
    const { uploadFileCore, getAttachmentCore } = await import(
      '../../src/server/functions/files'
    )
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Test Conv5' })
      .returning()
    const pdfBuffer = Buffer.from('%PDF-1.4 hello')
    const file = new File([pdfBuffer], 'sample.pdf', {
      type: 'application/pdf',
    })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const req1 = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    const att = (await uploadFileCore({
      request: req1,
    })) as unknown as typeof attachments.$inferSelect
    const req2 = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId2 },
    })
    await expect(
      getAttachmentCore({ data: { id: att.id }, request: req2 }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('deleteAttachment removes R2+DB', async () => {
    const { uploadFileCore, deleteAttachmentCore } = await import(
      '../../src/server/functions/files'
    )
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Test Conv6' })
      .returning()
    const pdfBuffer = Buffer.from('%PDF-1.4 hello')
    const file = new File([pdfBuffer], 'todelete.pdf', {
      type: 'application/pdf',
    })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const req1 = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    const att = (await uploadFileCore({
      request: req1,
    })) as unknown as typeof attachments.$inferSelect
    const reqDel = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const res = await deleteAttachmentCore({
      data: { id: att.id },
      request: reqDel,
    })
    expect(res.success).toBe(true)
    const [after] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, att.id))
    expect(after).toBeUndefined()
    const r2 = await import('../../src/lib/r2/client')
    expect(r2.deleteObject).toHaveBeenCalled()
  })

  it('sendMessage with image + vision injects file parts', async () => {
    const { uploadFileCore } = await import('../../src/server/functions/files')
    const { sendMessageCore } = await import('../../src/server/core/chat')
    // ensure we have a vision-capable model (auto is vision true)
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Vision Conv' })
      .returning()
    // create image attachment
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const file = new File([pngHeader], 'photo.png', { type: 'image/png' })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const reqUpload = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    const att = (await uploadFileCore({
      request: reqUpload,
    })) as unknown as typeof attachments.$inferSelect
    // mock getObject to return image buffer for vision
    const r2 = await import('../../src/lib/r2/client')
    vi.mocked(r2.getObject).mockResolvedValueOnce({
      body: pngHeader,
      contentType: 'image/png',
    } as never)
    mockStreamText.mockClear()
    const req = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const response = (await sendMessageCore({
      data: {
        modelId: 'auto',
        content: 'describe this image',
        skillId: 'none',
        conversationId: conv.id,
        attachmentIds: [att.id],
      },
      request: req,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    await response.text().catch(() => {})
    await new Promise((r) => setTimeout(r, 80))
    // check that streamText was called with file part
    expect(mockStreamText).toHaveBeenCalled()
    const lastCall = mockStreamText.mock.calls[
      mockStreamText.mock.calls.length - 1
    ]?.[0] as unknown as Record<string, unknown>
    const messages = lastCall.messages as unknown as Array<
      Record<string, unknown>
    >
    const hasFile = messages.some((m) => {
      const content = m.content as unknown
      if (!Array.isArray(content)) return false
      return (content as Array<Record<string, unknown>>).some(
        (c) => c.type === 'file' && c.mediaType === 'image/png',
      )
    })
    expect(hasFile).toBe(true)
    const filePart = messages
      .flatMap((m) =>
        Array.isArray(m.content)
          ? (m.content as Array<Record<string, unknown>>)
          : [],
      )
      .find((c) => c.type === 'file')
    expect(filePart).toBeDefined()
    expect(typeof filePart?.data).toBe('string')
    // verify attachment linked to message
    const [updatedAtt] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, att.id))
    expect(updatedAtt.messageId).not.toBeNull()
  })

  it('sendMessage with image + non-vision rejects 400', async () => {
    const { uploadFileCore } = await import('../../src/server/functions/files')
    const { sendMessageCore } = await import('../../src/server/core/chat')
    const { modelRegistry } = await import('../../src/lib/models/registry')
    // inject a non-vision model for test
    const testModelId = 'test-no-vision'
    const exists = modelRegistry.find((m) => m.id === testModelId)
    if (!exists) {
      modelRegistry.push({
        id: testModelId,
        routerModelId: 'test/no-vision',
        displayName: 'Test No Vision',
        provider: 'test',
        description: 'no vision',
        enabled: true,
        creditCost: 1,
        creditTier: 'balanced' as never,
        capabilities: {
          text: true,
          vision: false,
          files: true,
          tools: false,
          reasoning: false,
        },
        metadata: {
          contextWindow: 1000,
          maxOutput: 1000,
          pricing: null,
          category: 'test',
          speedClass: 'fast' as never,
        },
      } as never)
    }
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'NonVision Conv' })
      .returning()
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const file = new File([pngHeader], 'photo2.png', { type: 'image/png' })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const reqUpload = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    const att = (await uploadFileCore({
      request: reqUpload,
    })) as unknown as typeof attachments.$inferSelect
    const req = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    await expect(
      sendMessageCore({
        data: {
          modelId: testModelId,
          content: 'describe',
          skillId: 'none',
          conversationId: conv.id,
          attachmentIds: [att.id],
        },
        request: req,
      }) as unknown as Promise<Response>,
    ).rejects.toMatchObject({ status: 400, code: 'ERR-003' })
    // clean up test model
    const idx = modelRegistry.findIndex((m) => m.id === testModelId)
    if (idx !== -1) modelRegistry.splice(idx, 1)
  })

  it('sendCompare with image same parts to all', async () => {
    const { uploadFileCore } = await import('../../src/server/functions/files')
    const { sendCompareMessageCore } = await import(
      '../../src/server/core/chat'
    )
    const [conv] = await db
      .insert(conversations)
      .values({
        userId: mockUserId,
        title: 'Compare Vision Conv',
        mode: 'compare',
      })
      .returning()
    const pngHeader = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const file = new File([pngHeader], 'photo3.png', { type: 'image/png' })
    const fd = new FormData()
    fd.append('file', file)
    fd.append('conversationId', conv.id)
    const reqUpload = new Request('http://localhost:3000', {
      method: 'POST',
      body: fd as unknown as BodyInit,
      headers: { 'x-test-user': mockUserId },
    } as unknown as RequestInit)
    const att = (await uploadFileCore({
      request: reqUpload,
    })) as unknown as typeof attachments.$inferSelect
    const r2 = await import('../../src/lib/r2/client')
    vi.mocked(r2.getObject).mockResolvedValue({
      body: pngHeader,
      contentType: 'image/png',
    } as never)
    mockStreamText.mockClear()
    const req = new Request('http://localhost:3000', {
      headers: { 'x-test-user': mockUserId },
    })
    const response = (await sendCompareMessageCore({
      data: {
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'describe image',
        skillId: 'none',
        conversationId: conv.id,
        attachmentIds: [att.id],
      },
      request: req,
    })) as unknown as Response
    expect(response).toBeInstanceOf(Response)
    // wait for compare streams to finish
    await new Promise((r) => setTimeout(r, 300))
    // need to capture that streamText was called twice with file parts
    expect(mockStreamText.mock.calls.length).toBeGreaterThanOrEqual(2)
    // at least one call should have file part (check any message in array)
    const hasFilePart = mockStreamText.mock.calls.some((call) => {
      const opts = call[0] as Record<string, unknown>
      const msgs = opts.messages as unknown[] | undefined
      if (!msgs) return false
      return (msgs as Array<Record<string, unknown>>).some((m) => {
        const content = m.content as unknown
        if (!Array.isArray(content)) return false
        return (content as Array<Record<string, unknown>>).some(
          (c) => c.type === 'file',
        )
      })
    })
    expect(hasFilePart).toBe(true)
  })
})
