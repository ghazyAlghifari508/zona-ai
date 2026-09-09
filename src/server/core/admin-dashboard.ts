import { count, desc, eq, isNull, or, sum } from 'drizzle-orm'
import { requireAdminSession } from '../../lib/auth/admin-guard'
import { db } from '../../lib/db/index'
import {
  auditLogs,
  creditTransactions,
  feedback,
  modelSettings,
  users,
} from '../../lib/db/schema'
import { type AuditLogItem, parseAuditLogMetadata } from './admin-audit'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/admin-dashboard.ts is server-only')
}

// Enforces admin authentication via requireAdminSession (delegates to getAuthSession)

export interface GetAdminDashboardMetricsParams {
  request: Request
}

export type RecentAuditLogItem = AuditLogItem

export interface AdminDashboardMetrics {
  totalUsers: number
  activeUsers: number
  bannedUsers: number
  newFeedbackCount: number
  disabledModelsCount: number
  totalCreditsInCirculation: number
  totalCreditTransactions: number
  recentAuditLogs: RecentAuditLogItem[]
}

export async function getAdminDashboardMetricsCore(
  params: GetAdminDashboardMetricsParams,
): Promise<AdminDashboardMetrics> {
  await requireAdminSession(params.request)

  const [
    totalUsersRes,
    activeUsersRes,
    bannedUsersRes,
    newFeedbackRes,
    disabledModelsRes,
    creditsRes,
    txRes,
    recentAuditLogRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(users),
    db
      .select({ value: count() })
      .from(users)
      .where(or(eq(users.banned, false), isNull(users.banned))),
    db.select({ value: count() }).from(users).where(eq(users.banned, true)),
    db
      .select({ value: count() })
      .from(feedback)
      .where(eq(feedback.status, 'new')),
    db
      .select({ value: count() })
      .from(modelSettings)
      .where(eq(modelSettings.isActive, false)),
    db.select({ total: sum(users.credits) }).from(users),
    db.select({ value: count() }).from(creditTransactions),
    db
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
      .orderBy(desc(auditLogs.createdAt))
      .limit(10),
  ])

  const recentAuditLogs: RecentAuditLogItem[] = recentAuditLogRows.map(
    (row) => ({
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
    }),
  )

  return {
    totalUsers: Number(totalUsersRes[0]?.value ?? 0),
    activeUsers: Number(activeUsersRes[0]?.value ?? 0),
    bannedUsers: Number(bannedUsersRes[0]?.value ?? 0),
    newFeedbackCount: Number(newFeedbackRes[0]?.value ?? 0),
    disabledModelsCount: Number(disabledModelsRes[0]?.value ?? 0),
    totalCreditsInCirculation: Number(creditsRes[0]?.total ?? 0),
    totalCreditTransactions: Number(txRes[0]?.value ?? 0),
    recentAuditLogs,
  }
}
