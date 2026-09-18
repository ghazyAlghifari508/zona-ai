import { AppError } from '../utils/errors'
import { type AuthSession, getAuthSession } from './session'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/auth/admin-guard.ts is server-only — do not import on the client',
  )
}

export function checkUserNotBanned(
  user?: {
    banned?: boolean | null
    banReason?: string | null
    banExpires?: Date | null
  } | null,
): void {
  const isActiveBan =
    user?.banned === true &&
    (user.banExpires === null ||
      user.banExpires === undefined ||
      user.banExpires.getTime() > Date.now())
  if (isActiveBan) {
    const reason = user.banReason?.trim() ? `: ${user.banReason.trim()}` : ''
    throw new AppError(
      `Akun Anda telah dinonaktifkan${reason}.`,
      403,
      'ERR-USER-BANNED',
    )
  }
}

export function preventAdminSelfBan(
  currentAdminId: string,
  targetUserId: string,
  targetRole: string | null | undefined,
): void {
  if (currentAdminId === targetUserId || targetRole === 'admin') {
    throw new AppError(
      'Admin utama tidak dapat menonaktifkan akun sendiri.',
      400,
      'ERR-004',
    )
  }
}

export async function requireAdminSession(
  request: Request,
): Promise<AuthSession> {
  const session = await getAuthSession(request)
  checkUserNotBanned(session.user)

  if (session.user.role !== 'admin') {
    throw new AppError(
      'Akses ditolak. Diperlukan hak akses administrator.',
      403,
      'ERR-003',
    )
  }

  return session
}
