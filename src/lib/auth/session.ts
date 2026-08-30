import { AppError } from '../utils/errors'
import { auth } from './auth'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/auth/session.ts is server-only — do not import on the client',
  )
}

export async function getAuthSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    throw new AppError('UNAUTHORIZED', 401, 'ERR-002')
  }
  return session
}

export async function getOptionalAuthSession(
  request: Request,
): Promise<AuthSession | null> {
  try {
    const session = await auth.api.getSession({ headers: request.headers })
    return session ?? null
  } catch {
    return null
  }
}

export type AuthSession = Awaited<ReturnType<typeof getAuthSession>>
