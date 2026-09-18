import { isRedirect, redirect } from '@tanstack/react-router'
import { requireAdminSession } from '../../lib/auth/admin-guard'
import { AppError } from '../../lib/utils/errors'

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'test') {
  throw new Error('src/server/core/admin-auth.ts is server-only')
}

// verifyAdminAccessCore validates admin authentication via requireAdminSession (which calls getAuthSession)
export async function verifyAdminAccessCore(request: Request) {
  try {
    const session = await requireAdminSession(request)
    return { user: session.user }
  } catch (error) {
    if (isRedirect(error)) {
      throw error
    }
    if (error instanceof AppError) {
      if (error.code === 'ERR-USER-BANNED') {
        throw redirect({ to: '/banned' })
      }
      if (error.status === 401 || error.code === 'ERR-002') {
        throw redirect({ to: '/auth/sign-in' })
      }
      if (error.status === 403 || error.code === 'ERR-003') {
        throw error
      }
    }
    throw redirect({ to: '/auth/sign-in' })
  }
}
