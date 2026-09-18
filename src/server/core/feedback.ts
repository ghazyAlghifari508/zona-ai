import { and, count, desc, eq } from 'drizzle-orm'
import {
  checkUserNotBanned,
  requireAdminSession,
} from '../../lib/auth/admin-guard'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db/index'
import { auditLogs, feedback, users } from '../../lib/db/schema'
import { env } from '../../lib/env.server'
import { putObject } from '../../lib/r2/client'
import { AppError } from '../../lib/utils/errors'
import {
  sanitizeFilename,
  validateMagicBytes,
} from '../../lib/utils/file-validation'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/feedback.ts is server-only')
}

export type FeedbackType = 'general' | 'feature' | 'bug'
export type FeedbackStatus = 'new' | 'in_progress' | 'resolved' | 'rejected'

export interface SubmitFeedbackData {
  type: FeedbackType
  title: string
  description: string
  stepsToReproduce?: string | null
  expectedBehavior?: string | null
  actualBehavior?: string | null
  attachmentR2Key?: string | null
  attachmentFileName?: string | null
  attachmentMimeType?: string | null
  attachmentFileSize?: number | null
}

export interface ListFeedbackParams {
  request: Request
  status?: FeedbackStatus | 'all' | null
  type?: FeedbackType | 'all' | null
  page?: number | null
  limit?: number | null
}

export interface UpdateFeedbackStatusData {
  feedbackId: string
  status: FeedbackStatus
  adminNotes?: string | null
}

const ALLOWED_FEEDBACK_MIMES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const

function isAllowedFeedbackMime(
  mime: string,
): mime is (typeof ALLOWED_FEEDBACK_MIMES)[number] {
  return (
    mime === 'image/png' ||
    mime === 'image/jpeg' ||
    mime === 'image/webp' ||
    mime === 'application/pdf'
  )
}

const MAX_FEEDBACK_FILE_SIZE = 10 * 1024 * 1024 // 10MB

function validateFeedbackAttachmentKey(
  key: string | null | undefined,
  userId: string,
): string | null {
  if (!key) return null
  const prefix = `feedback/${userId}/`
  if (!key.startsWith(prefix) || key.includes('..')) {
    throw new AppError('Lampiran feedback tidak valid.', 400, 'ERR-011')
  }
  return key
}

export async function submitFeedbackCore(params: {
  request: Request
  data: SubmitFeedbackData
}) {
  const session = await getAuthSession(params.request)
  checkUserNotBanned(session.user)

  const [created] = await db
    .insert(feedback)
    .values({
      userId: session.user.id,
      type: params.data.type,
      title: params.data.title.trim(),
      description: params.data.description.trim(),
      stepsToReproduce: params.data.stepsToReproduce?.trim() || null,
      expectedBehavior: params.data.expectedBehavior?.trim() || null,
      actualBehavior: params.data.actualBehavior?.trim() || null,
      attachmentR2Key: validateFeedbackAttachmentKey(
        params.data.attachmentR2Key,
        session.user.id,
      ),
      attachmentFileName: params.data.attachmentFileName || null,
      attachmentMimeType: params.data.attachmentMimeType || null,
      attachmentFileSize: params.data.attachmentFileSize || null,
      status: 'new',
    })
    .returning()

  return {
    success: true as const,
    feedback: created,
  }
}

export async function listFeedbackCore(params: ListFeedbackParams) {
  await requireAdminSession(params.request)

  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const offset = (page - 1) * limit

  const conditions = []

  if (params.status && params.status !== 'all') {
    conditions.push(eq(feedback.status, params.status))
  }

  if (params.type && params.type !== 'all') {
    conditions.push(eq(feedback.type, params.type))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const countResult = await db
    .select({ total: count() })
    .from(feedback)
    .where(whereClause)

  const total = Number(countResult[0]?.total ?? 0)

  const feedbackRows = await db
    .select({
      id: feedback.id,
      userId: feedback.userId,
      type: feedback.type,
      title: feedback.title,
      description: feedback.description,
      stepsToReproduce: feedback.stepsToReproduce,
      expectedBehavior: feedback.expectedBehavior,
      actualBehavior: feedback.actualBehavior,
      attachmentR2Key: feedback.attachmentR2Key,
      attachmentFileName: feedback.attachmentFileName,
      attachmentMimeType: feedback.attachmentMimeType,
      attachmentFileSize: feedback.attachmentFileSize,
      status: feedback.status,
      adminNotes: feedback.adminNotes,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(whereClause)
    .orderBy(desc(feedback.createdAt))
    .limit(limit)
    .offset(offset)

  return {
    feedback: feedbackRows,
    total,
    page,
    limit,
  }
}

export async function getFeedbackDetailCore(params: {
  request: Request
  feedbackId: string
}) {
  await requireAdminSession(params.request)

  const [item] = await db
    .select({
      id: feedback.id,
      userId: feedback.userId,
      type: feedback.type,
      title: feedback.title,
      description: feedback.description,
      stepsToReproduce: feedback.stepsToReproduce,
      expectedBehavior: feedback.expectedBehavior,
      actualBehavior: feedback.actualBehavior,
      attachmentR2Key: feedback.attachmentR2Key,
      attachmentFileName: feedback.attachmentFileName,
      attachmentMimeType: feedback.attachmentMimeType,
      attachmentFileSize: feedback.attachmentFileSize,
      status: feedback.status,
      adminNotes: feedback.adminNotes,
      createdAt: feedback.createdAt,
      updatedAt: feedback.updatedAt,
      userName: users.name,
      userEmail: users.email,
      userImage: users.image,
    })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(eq(feedback.id, params.feedbackId))

  if (!item) {
    throw new AppError('Feedback tidak ditemukan.', 404, 'ERR-003')
  }

  return item
}

export async function updateFeedbackStatusCore(params: {
  request: Request
  data: UpdateFeedbackStatusData
}) {
  const session = await requireAdminSession(params.request)

  const [existing] = await db
    .select()
    .from(feedback)
    .where(eq(feedback.id, params.data.feedbackId))

  if (!existing) {
    throw new AppError('Feedback tidak ditemukan.', 404, 'ERR-003')
  }

  const now = new Date()
  const adminNotes =
    params.data.adminNotes !== undefined
      ? params.data.adminNotes?.trim() || null
      : existing.adminNotes

  const [updated] = await db
    .update(feedback)
    .set({
      status: params.data.status,
      adminNotes,
      updatedAt: now,
    })
    .where(eq(feedback.id, params.data.feedbackId))
    .returning()

  await db.insert(auditLogs).values({
    adminId: session.user.id,
    adminEmail: session.user.email,
    action: 'feedback.status_update',
    targetId: params.data.feedbackId,
    targetType: 'feedback',
    metadata: {
      previousStatus: existing.status,
      status: params.data.status,
      adminNotes,
    },
    createdAt: now,
  })

  return {
    success: true as const,
    feedback: updated ?? existing,
  }
}

export async function uploadFeedbackAttachmentCore(params: {
  request: Request
}) {
  const session = await getAuthSession(params.request)
  checkUserNotBanned(session.user)

  let formData: FormData
  try {
    formData = await params.request.formData()
  } catch {
    throw new AppError('Format request tidak valid.', 400, 'ERR-011')
  }

  const rawFile = formData.get('file')
  if (!(rawFile instanceof File) || typeof rawFile.size !== 'number') {
    throw new AppError('Berkas lampiran tidak ditemukan.', 400, 'ERR-011')
  }
  const file = rawFile

  const mimeType = (file.type || '').trim().toLowerCase()
  if (!isAllowedFeedbackMime(mimeType)) {
    throw new AppError(
      'Format file tidak didukung. Harap unggah gambar (PNG, JPG, WebP) atau dokumen PDF.',
      400,
      'ERR-011',
    )
  }

  if (file.size > MAX_FEEDBACK_FILE_SIZE) {
    throw new AppError('Ukuran file maksimal 10MB.', 413, 'ERR-012')
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const magic = await validateMagicBytes(buffer, mimeType)
  if (!magic.ok) {
    throw new AppError('Format file tidak valid atau rusak.', 400, 'ERR-011')
  }

  const rawFeedbackEntry = formData.get('feedbackId')
  const rawFeedbackId =
    typeof rawFeedbackEntry === 'string' ? rawFeedbackEntry.trim() : null
  const feedbackId =
    rawFeedbackId && rawFeedbackId.length > 0
      ? rawFeedbackId
      : crypto.randomUUID()
  const sanitizedFileName = sanitizeFilename(file.name)
  const r2Key = `feedback/${session.user.id}/${feedbackId}/${sanitizedFileName}`

  await putObject({
    bucket: env.R2_BUCKET_NAME,
    key: r2Key,
    body: buffer,
    contentType: mimeType,
  })

  return {
    success: true as const,
    r2Key,
    fileName: sanitizedFileName,
    mimeType,
    fileSize: file.size,
    feedbackId,
  }
}
