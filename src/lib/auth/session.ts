import { auth } from './auth'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/auth/session.ts is server-only — do not import on the client',
  )
}

export async function getAuthSession(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    const e = new Error('UNAUTHORIZED') as unknown as Record<string, unknown>
    ;(e as { status: number }).status = 401
    ;(e as { code: string }).code = 'ERR-002'
    throw e
  }
  return session
}
