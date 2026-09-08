import { AppError } from '../utils/errors'
import { type AuthSession, getAdminEmails, getAuthSession } from './session'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/auth/admin-guard.ts is server-only — do not import on the client',
  )
}

export function checkUserNotBanned(
  user?: {
    banned?: boolean | null
    banReason?: string | null
  } | null,
): void {
  if (user?.banned) {
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
  targetEmail: string,
): void {
  const adminEmails = getAdminEmails()
  const normalizedTargetEmail = targetEmail.trim().toLowerCase()

  if (
    currentAdminId === targetUserId ||
    adminEmails.includes(normalizedTargetEmail) ||
    normalizedTargetEmail === 'alghifarighazy508@gmail.com'
  ) {
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
