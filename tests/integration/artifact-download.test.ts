/**
 * @vitest-environment node
 */
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import {
  attachments,
  conversations,
  messages,
  users,
} from '../../src/lib/db/schema'

vi.mock('../../src/lib/r2/client', () => ({
  putObject: vi.fn(async () => {}),
  getObject: vi.fn(async () => ({
    body: Buffer.from('# Skill\n\nBody'),
    contentType: 'text/markdown',
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
    return { user: { id: 'test-user-download', email: 'dl@example.com' } }
  }),
}))

import { getAttachmentCore } from '../../src/server/functions/files'

const mockUserId = 'test-user-download'
const otherUserId = 'someone-else'
let attachmentId = ''

describe('artifact download', () => {
  beforeEach(async () => {
    await db.delete(attachments).where(eq(attachments.userId, mockUserId))
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    for (const c of convs) {
      await db.delete(attachments).where(eq(attachments.conversationId, c.id))
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, mockUserId))
    await db.delete(users).where(eq(users.id, otherUserId))
    await db.insert(users).values({
      id: mockUserId,
      email: 'dl@example.com',
      name: 'TestDownload',
      credits: 100,
    } as never)
    await db.insert(users).values({
      id: otherUserId,
      email: 'someone-else@example.com',
      name: 'SomeoneElse',
      credits: 100,
    } as never)
    const [conv] = await db
      .insert(conversations)
      .values({ userId: mockUserId, title: 'Download Conv' })
      .returning()
    const [msg] = await db
      .insert(messages)
      .values({
        conversationId: conv.id,
        role: 'assistant',
        content: 'Skill `Frontend Design` selesai dibuat.',
      })
      .returning()
    const [att] = await db
      .insert(attachments)
      .values({
        userId: mockUserId,
        conversationId: conv.id,
        messageId: msg.id,
        fileName: 'frontend-design.md',
        fileSize: Buffer.byteLength('# Skill\n\nBody', 'utf8'),
        mimeType: 'text/markdown',
        r2Key: `users/${mockUserId}/attachments/${crypto.randomUUID()}/frontend-design.md`,
        r2Bucket: 'test-bucket',
        processingStatus: 'completed',
      })
      .returning()
    attachmentId = att.id
  })

  afterAll(async () => {
    await db.delete(attachments).where(eq(attachments.userId, mockUserId))
    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, mockUserId))
    for (const c of convs) {
      await db.delete(conversations).where(eq(conversations.id, c.id))
    }
    await db.delete(users).where(eq(users.id, mockUserId))
    await db.delete(users).where(eq(users.id, otherUserId))
  })

  it('serves attachment disposition with exact bytes when download is set', async () => {
    const res = await getAttachmentCore({
      data: { id: attachmentId, download: true },
      request: new Request('http://localhost/'),
    })
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toContain('attachment;')
    expect(res.headers.get('Content-Disposition')).toContain('.md"')
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    const bytes = Buffer.from(await res.arrayBuffer())
    expect(bytes.toString('utf8')).toBe('# Skill\n\nBody')
    expect(res.headers.get('Content-Length')).toBe(String(bytes.length))
  })

  it('keeps inline disposition by default', async () => {
    const res = await getAttachmentCore({
      data: { id: attachmentId },
      request: new Request('http://localhost/'),
    })
    expect(res.headers.get('Content-Disposition')).toContain('inline;')
  })

  it('denies other users', async () => {
    await expect(
      getAttachmentCore({
        data: { id: attachmentId },
        request: new Request('http://localhost/', {
          headers: { 'x-test-user': 'someone-else' },
        }),
      }),
    ).rejects.toThrow()
  })
})
