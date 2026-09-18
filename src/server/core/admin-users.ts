import { and, count, desc, eq, ilike, or } from 'drizzle-orm'
import {
  preventAdminSelfBan,
  requireAdminSession,
} from '../../lib/auth/admin-guard'
import { db } from '../../lib/db/index'
import { auditLogs, users } from '../../lib/db/schema'
import { AppError } from '../../lib/utils/errors'

// Enforces admin authentication via requireAdminSession (delegates to getAuthSession)
if (typeof window !== 'undefined') {
  throw new Error('src/server/core/admin-users.ts is server-only')
}

export interface ListUsersParams {
  request: Request
  search?: string | null
  role?: 'all' | 'admin' | 'user' | null
  status?: 'all' | 'active' | 'banned' | null
  page?: number | null
  limit?: number | null
}

export interface BanUserData {
  userId: string
  reason?: string | null
  expiresAt?: string | Date | null
}

export interface UnbanUserData {
  userId: string
}

export interface DeleteUserData {
  userId: string
}

export async function listUsersCore(params: ListUsersParams) {
  await requireAdminSession(params.request)

  const page = Math.max(1, params.page ?? 1)
  const limit = Math.min(100, Math.max(1, params.limit ?? 20))
  const offset = (page - 1) * limit

  const conditions = []

  if (params.search && params.search.trim().length > 0) {
    const term = `%${params.search.trim()}%`
    conditions.push(or(ilike(users.name, term), ilike(users.email, term)))
  }

  if (params.role && params.role !== 'all') {
    conditions.push(eq(users.role, params.role))
  }

  if (params.status && params.status !== 'all') {
    if (params.status === 'banned') {
      conditions.push(eq(users.banned, true))
    } else if (params.status === 'active') {
      conditions.push(eq(users.banned, false))
    }
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
      emailVerified: users.emailVerified,
      image: users.image,
      credits: users.credits,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      banExpires: users.banExpires,
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

export async function banUserCore(params: {
  request: Request
  data: BanUserData
}): Promise<{
  success: true
  user: {
    id: string
    banned: boolean
    banReason: string | null
    banExpires: Date | null
  }
}> {
  const session = await requireAdminSession(params.request)

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.data.userId))

  if (!targetUser) {
    throw new AppError('Pengguna tidak ditemukan.', 404, 'ERR-003')
  }

  preventAdminSelfBan(session.user.id, targetUser.id, targetUser.role)

  const banExpires = params.data.expiresAt
    ? new Date(params.data.expiresAt)
    : null
  const banReason = params.data.reason?.trim() || null
  const now = new Date()

  const updatedUser = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ banned: true, banReason, banExpires, updatedAt: now })
      .where(eq(users.id, params.data.userId))
      .returning()
    if (!updated)
      throw new AppError('Pengguna tidak ditemukan.', 404, 'ERR-003')
    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: 'user.ban',
      targetId: params.data.userId,
      targetType: 'user',
      metadata: {
        reason: banReason,
        expiresAt: banExpires ? banExpires.toISOString() : null,
      },
      createdAt: now,
    })
    return updated
  })

  return {
    success: true,
    user: {
      id: updatedUser.id,
      banned: true,
      banReason,
      banExpires,
    },
  }
}

export async function unbanUserCore(params: {
  request: Request
  data: UnbanUserData
}): Promise<{
  success: true
  user: {
    id: string
    banned: boolean
    banReason: string | null
    banExpires: Date | null
  }
}> {
  const session = await requireAdminSession(params.request)

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.data.userId))

  if (!targetUser) {
    throw new AppError('Pengguna tidak ditemukan.', 404, 'ERR-003')
  }

  const now = new Date()

  const updatedUser = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(users)
      .set({ banned: false, banReason: null, banExpires: null, updatedAt: now })
      .where(eq(users.id, params.data.userId))
      .returning()
    if (!updated)
      throw new AppError('Pengguna tidak ditemukan.', 404, 'ERR-003')
    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: 'user.unban',
      targetId: params.data.userId,
      targetType: 'user',
      metadata: null,
      createdAt: now,
    })
    return updated
  })

  return {
    success: true,
    user: {
      id: updatedUser.id,
      banned: false,
      banReason: null,
      banExpires: null,
    },
  }
}

export async function deleteUserCore(params: {
  request: Request
  data: DeleteUserData
}): Promise<{
  success: true
  deletedUserId: string
}> {
  const session = await requireAdminSession(params.request)

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, params.data.userId))

  if (!targetUser) {
    throw new AppError('Pengguna tidak ditemukan.', 404, 'ERR-003')
  }

  preventAdminSelfBan(session.user.id, targetUser.id, targetUser.role)

  const now = new Date()
  await db.transaction(async (tx) => {
    const deleted = await tx
      .delete(users)
      .where(eq(users.id, params.data.userId))
      .returning({ id: users.id })
    if (deleted.length === 0) {
      throw new AppError('Pengguna tidak ditemukan.', 404, 'ERR-003')
    }
    await tx.insert(auditLogs).values({
      adminId: session.user.id,
      adminEmail: session.user.email,
      action: 'user.delete',
      targetId: params.data.userId,
      targetType: 'user',
      metadata: {
        deletedEmail: targetUser.email,
        deletedName: targetUser.name,
        deletedRole: targetUser.role,
      },
      createdAt: now,
    })
  })

  return {
    success: true,
    deletedUserId: params.data.userId,
  }
}
