import { eq } from 'drizzle-orm'
import { db } from '../db/index'
import { users } from '../db/schema'
import { env } from '../env.server'
import { AppError } from '../utils/errors'
import { auth } from './auth'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/auth/session.ts is server-only — do not import on the client',
  )
}

export function getAdminEmails(): string[] {
  const adminEmailsRaw = env.ADMIN_EMAILS || 'alghifarighazy508@gmail.com'
  return adminEmailsRaw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

export async function getAuthSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    throw new AppError('UNAUTHORIZED', 401, 'ERR-002')
  }

  const adminEmails = getAdminEmails()
  if (
    session.user.email &&
    adminEmails.includes(session.user.email.toLowerCase()) &&
    session.user.role !== 'admin'
  ) {
    await db
      .update(users)
      .set({ role: 'admin', updatedAt: new Date() })
      .where(eq(users.id, session.user.id))
    session.user.role = 'admin'
  }

  return session
}

export async function getOptionalAuthSession(
  request: Request,
): Promise<AuthSession | null> {
  try {
    return await getAuthSession(request)
  } catch {
    return null
  }
}

export type AuthSession = Awaited<ReturnType<typeof getAuthSession>>
