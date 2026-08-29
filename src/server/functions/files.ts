import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db/index'
import { attachments, conversations } from '../../lib/db/schema'
import { deleteObject, getObject, putObject } from '../../lib/r2/client'
import { enforceRateLimit } from '../../lib/security/rate-limit'
import {
  RATE_LIMIT_UPLOAD_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '../../lib/utils/constants'
import { AppError } from '../../lib/utils/errors'
import {
  sanitizeFilename,
  validateMagicBytes,
  validateMime,
  validateSize,
} from '../../lib/utils/file-validation'

function httpError(status: number, message: string, code?: string): AppError {
  return new AppError(message, status, code ?? 'ERR-000')
}

export async function uploadFileCore({ request }: { request: Request }) {
  const session = await getAuthSession(request)
  const userId = session.user.id

  // Rate limit before R2 write (SECURITY.md §13)
  enforceRateLimit({
    key: `upload:${userId}`,
    limit: RATE_LIMIT_UPLOAD_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    throw httpError(400, 'Invalid FormData')
  }

  const file = formData.get('file') as File | null
  const conversationId = formData.get('conversationId') as string | null

  if (!file) throw httpError(400, 'No file')
  if (!conversationId) throw httpError(400, 'conversationId required')

  // Validate conversation ownership
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  if (!conv || conv.userId !== userId) throw httpError(403, 'Forbidden')

  const mime = (file.type || '').trim()
  const mimeCheck = validateMime(mime)
  if (!mimeCheck.ok)
    throw httpError(
      400,
      'This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.',
      'ERR-011',
    )

  const sizeCheck = validateSize(file.size)
  if (!sizeCheck.ok)
    throw httpError(
      413,
      `File is too large. Maximum size: ${Math.round(Number(process.env.MAX_FILE_SIZE_BYTES ?? 10_485_760) / 1048576)}MB.`,
      'ERR-012',
    )

  const buffer = Buffer.from(await file.arrayBuffer())
  const magic = await validateMagicBytes(buffer, mime)
  if (!magic.ok)
    throw httpError(
      400,
      'This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.',
      'ERR-011',
    )

  const sanitized = sanitizeFilename(file.name)
  const attachmentId = crypto.randomUUID()
  const r2Key = `users/${userId}/attachments/${attachmentId}/${sanitized}`

  try {
    await putObject({ key: r2Key, body: buffer, contentType: mime })
  } catch (_e) {
    throw httpError(500, 'File upload failed. Please try again.', 'ERR-010')
  }

  const [row] = await db
    .insert(attachments)
    .values({
      id: attachmentId,
      userId,
      conversationId,
      messageId: null,
      fileName: sanitized,
      fileSize: file.size,
      mimeType: mime,
      r2Key,
      r2Bucket: process.env.R2_BUCKET_NAME as string,
      processingStatus: 'pending',
      extractedText: null,
    })
    .returning()

  // Trigger RAG processing async; in test await to make assertions deterministic
  try {
    const { processDocument } = await import('../../lib/rag/process')
    if (process.env.NODE_ENV === 'test') {
      await processDocument(attachmentId)
    } else {
      setImmediate(() => {
        processDocument(attachmentId).catch((e) =>
          console.error('processDocument failed', e),
        )
      })
    }
  } catch (e) {
    console.error('processDocument trigger failed', e)
  }

  return row
}

export async function getAttachmentCore({
  data,
  request,
}: {
  data: { id: string }
  request: Request
}) {
  const session = await getAuthSession(request)
  const userId = session.user.id

  const parsed = z.object({ id: z.string().uuid() }).safeParse(data)
  if (!parsed.success) throw httpError(400, 'Invalid id')

  const [att] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, data.id))
  if (!att) throw httpError(404, 'Not found')
  if (att.userId !== userId) throw httpError(403, 'Forbidden')

  const { body, contentType } = await getObject(att.r2Key)
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType || att.mimeType,
      'Content-Disposition': `inline; filename="${att.fileName}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

export async function deleteAttachmentCore({
  data,
  request,
}: {
  data: { id: string }
  request: Request
}) {
  const session = await getAuthSession(request)
  const userId = session.user.id

  const parsed = z.object({ id: z.string().uuid() }).safeParse(data)
  if (!parsed.success) throw httpError(400, 'Invalid id')

  const [att] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, data.id))
  if (!att) throw httpError(404, 'Not found')
  if (att.userId !== userId) throw httpError(403, 'Forbidden')

  try {
    await deleteObject(att.r2Key)
  } catch {
    // ignore if not found
  }
  await db.delete(attachments).where(eq(attachments.id, data.id))
  return { success: true as const }
}

export async function getAttachmentsCore({
  data,
  request,
}: {
  data: { conversationId: string }
  request: Request
}) {
  const session = await getAuthSession(request)
  const userId = session.user.id
  const parsed = z.object({ conversationId: z.string().uuid() }).safeParse(data)
  if (!parsed.success) throw httpError(400, 'Invalid conversationId')
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, data.conversationId))
  if (!conv || conv.userId !== userId) throw httpError(403, 'Forbidden')
  const rows = await db
    .select()
    .from(attachments)
    .where(eq(attachments.conversationId, data.conversationId))
  return rows
}

export async function reprocessAttachmentCore({
  data,
  request,
}: {
  data: { id: string }
  request: Request
}) {
  const session = await getAuthSession(request)
  const userId = session.user.id
  const parsed = z.object({ id: z.string().uuid() }).safeParse(data)
  if (!parsed.success) throw httpError(400, 'Invalid id')
  const [att] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, data.id))
  if (!att) throw httpError(404, 'Not found')
  if (att.userId !== userId) throw httpError(403, 'Forbidden')
  const { processDocument } = await import('../../lib/rag/process')
  await processDocument(data.id)
  const [updated] = await db
    .select()
    .from(attachments)
    .where(eq(attachments.id, data.id))
  return updated
}

// TanStack Start wrappers

export const uploadFile = createServerFn({ method: 'POST' }).handler(
  async () => {
    const request = getRequest() as Request
    return uploadFileCore({ request })
  },
)

export const getAttachment = createServerFn({ method: 'GET' })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return getAttachmentCore({ data: data as { id: string }, request })
  })

export const deleteAttachment = createServerFn({ method: 'POST' })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return deleteAttachmentCore({ data: data as { id: string }, request })
  })

export const getAttachments = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return getAttachmentsCore({
      data: data as { conversationId: string },
      request,
    })
  })

export const reprocessAttachment = createServerFn({ method: 'POST' })
  .validator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return reprocessAttachmentCore({ data: data as { id: string }, request })
  })
