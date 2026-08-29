/**
 * @vitest-environment node
 */
import { eq, sql } from 'drizzle-orm'
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
    const res = (await uploadFileCore({ request })) as unknown as typeof attachments.$inferSelect
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
    const att = (await uploadFileCore({ request: req1 })) as unknown as typeof attachments.$inferSelect
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
    const att = (await uploadFileCore({ request: req1 })) as unknown as typeof attachments.$inferSelect
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

})
