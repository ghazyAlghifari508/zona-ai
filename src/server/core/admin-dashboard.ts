import { and, count, desc, eq, gte, isNull, or, sum } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { requireAdminSession } from '../../lib/auth/admin-guard'
import { db } from '../../lib/db/index'
import {
  auditLogs,
  creditTransactions,
  feedback,
  modelCatalog,
  modelSettings,
  users,
} from '../../lib/db/schema'

import { type AuditLogItem, parseAuditLogMetadataResult } from './admin-audit'

const targetUsers = alias(users, 'audit_target_users')
const targetModels = alias(modelCatalog, 'audit_target_models')

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/admin-dashboard.ts is server-only')
}

// Enforces admin authentication via requireAdminSession (delegates to getAuthSession)

export interface GetAdminDashboardMetricsParams {
  request: Request
}

export type RecentAuditLogItem = AuditLogItem

export interface DailyMetricPoint {
  date: string
  label: string
  creditsUsed: number
  transactionsCount: number
}

export function buildDailyMetricPoints(
  transactions: Array<{
    createdAt: Date | string | null
    amount: number
    type: string
  }>,
  now: Date = new Date(),
): DailyMetricPoint[] {
  const points: DailyMetricPoint[] = []
  const txByDay = new Map<
    string,
    { creditsUsed: number; transactionsCount: number }
  >()

  if (Array.isArray(transactions)) {
    for (const tx of transactions) {
      if (!tx.createdAt) continue
      const d =
        typeof tx.createdAt === 'string' ? new Date(tx.createdAt) : tx.createdAt
      const key = d.toISOString().slice(0, 10)
      const existing = txByDay.get(key) ?? {
        creditsUsed: 0,
        transactionsCount: 0,
      }
      if (tx.type === 'deduct') {
        existing.creditsUsed += Math.abs(tx.amount)
      }
      existing.transactionsCount += 1
      txByDay.set(key, existing)
    }
  }

  for (let i = 29; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
    const key = d.toISOString().slice(0, 10)
    const label = new Intl.DateTimeFormat('id-ID', {
      day: 'numeric',
      month: 'short',
    }).format(d)
    const stat = txByDay.get(key) ?? { creditsUsed: 0, transactionsCount: 0 }
    points.push({
      date: key,
      label,
      creditsUsed: stat.creditsUsed,
      transactionsCount: stat.transactionsCount,
    })
  }

  return points
}

export interface AdminDashboardMetrics {
  totalUsers: number
  activeUsers: number
  bannedUsers: number
  newFeedbackCount: number
  disabledModelsCount: number
  totalCreditsInCirculation: number
  totalCreditTransactions: number
  recentAuditLogs: RecentAuditLogItem[]
  chartData: DailyMetricPoint[]
}

export async function getAdminDashboardMetricsCore(
  params: GetAdminDashboardMetricsParams,
): Promise<AdminDashboardMetrics> {
  await requireAdminSession(params.request)

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  const [
    totalUsersRes,
    activeUsersRes,
    bannedUsersRes,
    newFeedbackRes,
    disabledModelsRes,
    creditsRes,
    txRes,
    recentAuditLogRows,
    chartTxRows,
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
      .where(eq(modelSettings.status, 'inactive')),
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
      .orderBy(desc(auditLogs.createdAt))
      .limit(10),
    db
      .select({
        createdAt: creditTransactions.createdAt,
        amount: creditTransactions.amount,
        type: creditTransactions.type,
      })
      .from(creditTransactions)
      .where(gte(creditTransactions.createdAt, thirtyDaysAgo)),
  ])

  const recentAuditLogs: RecentAuditLogItem[] = (recentAuditLogRows ?? []).map(
    (row) => {
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
    },
  )

  const chartData = buildDailyMetricPoints(chartTxRows ?? [])

  return {
    totalUsers: Number(totalUsersRes[0]?.value ?? 0),
    activeUsers: Number(activeUsersRes[0]?.value ?? 0),
    bannedUsers: Number(bannedUsersRes[0]?.value ?? 0),
    newFeedbackCount: Number(newFeedbackRes[0]?.value ?? 0),
    disabledModelsCount: Number(disabledModelsRes[0]?.value ?? 0),
    totalCreditsInCirculation: Number(creditsRes[0]?.total ?? 0),
    totalCreditTransactions: Number(txRes[0]?.value ?? 0),
    recentAuditLogs,
    chartData,
  }
}
