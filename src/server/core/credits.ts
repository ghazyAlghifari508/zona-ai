/**
 * Server-only credit helpers.
 * NEVER import from client code.
 */
import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import { getCreditBalance, resetDevCredits } from '../../lib/ai/credits'
import { requireAdminSession } from '../../lib/auth/admin-guard'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db/index'
import { auditLogs, creditTransactions, users } from '../../lib/db/schema'
import { AppError } from '../../lib/utils/errors'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/credits.ts is server-only')
}

export async function getCreditBalanceCore({ request }: { request: Request }) {
  const session = await getAuthSession(request)
  const balance = await getCreditBalance(session.user.id)
  return { balance }
}

export async function resetDevCreditsCore({
  request,
  targetUserId,
}: {
  request: Request
  targetUserId?: string | null
}) {
  const session = await requireAdminSession(request)

  if (process.env.NODE_ENV === 'production') {
    throw new AppError(
      'Aksi ini tidak tersedia di lingkungan produksi.',
      403,
      'ERR-003',
    )
  }

  const targetId = targetUserId ?? session.user.id
  const bal = await resetDevCredits(targetId)

  await db.insert(auditLogs).values({
    adminId: session.user.id,
    adminEmail: session.user.email,
    action: 'credit.reset',
    targetId,
    targetType: 'user',
    metadata: { newBalance: bal },
    createdAt: new Date(),
  })

  return { success: true as const, newBalance: bal }
}

export interface AdjustUserCreditsParams {
  request: Request
  data: {
    userId: string
    amount: number
    mode: 'add' | 'deduct' | 'set'
    reason?: string | null
  }
}

export async function adjustUserCreditsCore(
  params: AdjustUserCreditsParams,
): Promise<{
  success: true
  newBalance: number
  previousBalance: number
}> {
  const session = await requireAdminSession(params.request)

  return db.transaction(async (tx) => {
    const [targetUser] = await tx
      .select({ id: users.id, credits: users.credits })
      .from(users)
      .where(eq(users.id, params.data.userId))
      .for('update')

    if (!targetUser) {
      throw new AppError('Pengguna tidak ditemukan.', 404, 'ERR-003')
    }

    const previousBalance = targetUser.credits ?? 0
    let newBalance = previousBalance

    if (params.data.mode === 'add') {
      newBalance = previousBalance + params.data.amount
    } else if (params.data.mode === 'deduct') {
      newBalance = Math.max(0, previousBalance - params.data.amount)
    } else if (params.data.mode === 'set') {
      newBalance = Math.max(0, params.data.amount)
    }

    const delta = newBalance - previousBalance
    const now = new Date()

    await tx
      .update(users)
      .set({
        credits: newBalance,
        updatedAt: now,
      })
      .where(eq(users.id, params.data.userId))

    await tx.insert(creditTransactions).values({
      userId: params.data.userId,
      amount: delta,
      type: 'adjustment',
      balanceAfter: newBalance,
      description:
        params.data.reason?.trim() || `Admin adjustment (${params.data.mode})`,
      createdAt: now,
    })

    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: 'credit.adjust',
      targetId: params.data.userId,
      targetType: 'user',
      metadata: {
        mode: params.data.mode,
        amount: params.data.amount,
        previousBalance,
        newBalance,
        reason: params.data.reason?.trim() || null,
      },
      createdAt: now,
    })

    return {
      success: true as const,
      newBalance,
      previousBalance,
    }
  })
}

export interface ListUserCreditsParams {
  request: Request
  search?: string | null
  page?: number | null
  limit?: number | null
}

export async function listUserCreditsCore(params: ListUserCreditsParams) {
  await requireAdminSession(params.request)

  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const offset = (page - 1) * limit

  const conditions = []

  if (params.search && params.search.trim().length > 0) {
    const term = `%${params.search.trim()}%`
    conditions.push(or(ilike(users.name, term), ilike(users.email, term)))
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const countResult = await db
    .select({ total: count() })
    .from(users)
    .where(whereClause)

  const total = Number(countResult[0]?.total ?? 0)

  const userRows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      credits: users.credits,
      role: users.role,
      banned: users.banned,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(whereClause)
    .orderBy(desc(users.createdAt))
    .limit(limit)
    .offset(offset)

  return {
    users: userRows,
    total,
    page,
    limit,
  }
}
