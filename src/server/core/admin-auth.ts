import { isRedirect, redirect } from '@tanstack/react-router'
import { requireAdminSession } from '../../lib/auth/admin-guard'

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
    throw redirect({ to: '/auth/sign-in' })
  }
}
