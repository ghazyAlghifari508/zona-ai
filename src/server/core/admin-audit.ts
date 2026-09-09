import { and, count, desc, eq, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { requireAdminSession } from '../../lib/auth/admin-guard'
import { db } from '../../lib/db/index'
import { auditLogs, users } from '../../lib/db/schema'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/admin-audit.ts is server-only')
}

// Enforces admin authentication via requireAdminSession (delegates to getAuthSession)

export const auditLogMetadataValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
  z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
])

export const auditLogMetadataSchema = z
  .record(z.string(), auditLogMetadataValueSchema)
  .nullable()

export type AuditLogMetadata = z.infer<typeof auditLogMetadataSchema>

export interface ListAuditLogsParams {
  request: Request
  action?: string | null
  adminId?: string | null
  targetType?: string | null
  targetId?: string | null
  page?: number | null
  limit?: number | null
}

export interface AuditLogItem {
  id: string
  adminId: string
  adminEmail: string
  adminName: string | null
  adminImage: string | null
  action: string
  targetId: string
  targetType: string
  metadata: AuditLogMetadata
  createdAt: Date | null
}

export interface ListAuditLogsResponse {
  items: AuditLogItem[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export function parseAuditLogMetadata(raw: unknown): AuditLogMetadata {
  const result = auditLogMetadataSchema.safeParse(raw ?? null)
  return result.success ? result.data : null
}

export async function listAuditLogsCore(
  params: ListAuditLogsParams,
): Promise<ListAuditLogsResponse> {
  await requireAdminSession(params.request)

  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const offset = (page - 1) * limit

  const conditions: SQL[] = []

  if (params.action && params.action !== 'all') {
    conditions.push(eq(auditLogs.action, params.action))
  }

  if (params.adminId && params.adminId !== 'all') {
    conditions.push(eq(auditLogs.adminId, params.adminId))
  }

  if (params.targetType && params.targetType !== 'all') {
    conditions.push(eq(auditLogs.targetType, params.targetType))
  }

  if (params.targetId && params.targetId !== 'all') {
    conditions.push(eq(auditLogs.targetId, params.targetId))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const countResult = await db
    .select({ total: count() })
    .from(auditLogs)
    .where(whereClause)

  const total = Number(countResult[0]?.total ?? 0)
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0

  const rows = await db
    .select({
      id: auditLogs.id,
      adminId: auditLogs.adminId,
      adminEmail: auditLogs.adminEmail,
      adminName: users.name,
      adminImage: users.image,
      action: auditLogs.action,
      targetId: auditLogs.targetId,
      targetType: auditLogs.targetType,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.adminId, users.id))
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit)
    .offset(offset)

  const items: AuditLogItem[] = rows.map((row) => ({
    id: row.id,
    adminId: row.adminId,
    adminEmail: row.adminEmail,
    adminName: row.adminName,
    adminImage: row.adminImage,
    action: row.action,
    targetId: row.targetId,
    targetType: row.targetType,
    metadata: parseAuditLogMetadata(row.metadata),
    createdAt: row.createdAt,
  }))

  return {
    items,
    pagination: {
      total,
      page,
      limit,
      totalPages,
    },
  }
}
