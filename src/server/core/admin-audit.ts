import { and, count, desc, eq, ilike, or, type SQL, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  type AuditLogMetadata,
  parseAuditLogMetadataValue,
} from '../../lib/admin/audit-metadata'
import { requireAdminSession } from '../../lib/auth/admin-guard'
import { db } from '../../lib/db/index'
import { auditLogs, modelCatalog, users } from '../../lib/db/schema'

const targetUsers = alias(users, 'audit_target_users')
const targetModels = alias(modelCatalog, 'audit_target_models')

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/admin-audit.ts is server-only')
}

// Enforces admin authentication via requireAdminSession (delegates to getAuthSession)

export type { AuditLogMetadata } from '../../lib/admin/audit-metadata'

export interface ListAuditLogsParams {
  request: Request
  action?: string | null
  adminId?: string | null
  targetType?: string | null
  targetId?: string | null
  search?: string | null
  page?: number | null
  limit?: number | null
}

export interface AuditLogItem {
  id: string
  adminId: string | null
  adminEmail: string
  adminName: string | null
  adminImage: string | null
  action: string
  targetId: string
  targetType: string
  currentTargetName: string | null
  metadata: AuditLogMetadata
  metadataUnreadable: boolean
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

export function parseAuditLogMetadataResult(raw: unknown) {
  return parseAuditLogMetadataValue(raw)
}

export function parseAuditLogMetadata(raw: unknown): AuditLogMetadata {
  return parseAuditLogMetadataResult(raw).metadata
}

function escapeLikeTerm(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&')
}

function buildSearchCondition(search: string): SQL {
  const pattern = `%${escapeLikeTerm(search.trim())}%`
  const condition = or(
    ilike(users.name, pattern),
    ilike(auditLogs.adminEmail, pattern),
    ilike(auditLogs.adminId, pattern),
    ilike(auditLogs.targetId, pattern),
    ilike(
      sql<string>`${auditLogs.metadata}->'actorSnapshot'->>'displayName'`,
      pattern,
    ),
    ilike(sql<string>`${auditLogs.metadata}->'actorSnapshot'->>'id'`, pattern),
    ilike(
      sql<string>`${auditLogs.metadata}->'targetSnapshot'->>'displayName'`,
      pattern,
    ),
    ilike(sql<string>`${auditLogs.metadata}->'targetSnapshot'->>'id'`, pattern),
    ilike(sql<string>`${auditLogs.metadata}->>'deletedName'`, pattern),
    ilike(targetUsers.name, pattern),
    ilike(targetModels.displayName, pattern),
  )
  return condition ?? sql`true`
}

export async function listAuditLogsCore(
  params: ListAuditLogsParams,
): Promise<ListAuditLogsResponse> {
  await requireAdminSession(params.request)

  let page = Math.max(1, Math.floor(params.page ?? 1))
  const limit = Math.min(100, Math.max(1, Math.floor(params.limit ?? 20)))
  let offset = (page - 1) * limit

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

  if (params.search?.trim()) {
    conditions.push(buildSearchCondition(params.search))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const countResult = await db
    .select({ total: count() })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.adminId, users.id))
    .leftJoin(
      targetUsers,
      and(
        eq(auditLogs.targetType, 'user'),
        eq(auditLogs.targetId, targetUsers.id),
      ),
    )
    .leftJoin(
      targetModels,
      and(
        eq(auditLogs.targetType, 'model'),
        eq(auditLogs.targetId, targetModels.id),
      ),
    )
    .where(whereClause)

  const total = Number(countResult[0]?.total ?? 0)
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0
  if (totalPages > 0 && page > totalPages) {
    page = totalPages
    offset = (page - 1) * limit
  }

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
      targetUserName: targetUsers.name,
      targetModelName: targetModels.displayName,
      metadata: auditLogs.metadata,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.adminId, users.id))
    .leftJoin(
      targetUsers,
      and(
        eq(auditLogs.targetType, 'user'),
        eq(auditLogs.targetId, targetUsers.id),
      ),
    )
    .leftJoin(
      targetModels,
      and(
        eq(auditLogs.targetType, 'model'),
        eq(auditLogs.targetId, targetModels.id),
      ),
    )
    .where(whereClause)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(limit)
    .offset(offset)

  const items: AuditLogItem[] = rows.map((row) => {
    const parsed = parseAuditLogMetadataResult(row.metadata)
    return {
      id: row.id,
      adminId: row.adminId,
      adminEmail: row.adminEmail,
      adminName: row.adminName,
      adminImage: row.adminImage,
      action: row.action,
      targetId: row.targetId,
      targetType: row.targetType,
      currentTargetName: row.targetUserName ?? row.targetModelName ?? null,
      metadata: parsed.metadata,
      metadataUnreadable: parsed.unreadable,
      createdAt: row.createdAt,
    }
  })

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
