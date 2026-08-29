/**
 * Server-only credit helpers.
 * NEVER import from client code.
 */
import { resetDevCredits } from '../../lib/ai/credits'
import { getAuthSession } from '../../lib/auth/session'

export async function resetDevCreditsCore({ request }: { request: Request }) {
  if (process.env.NODE_ENV === 'production') throw new Error('Forbidden')
  const session = await getAuthSession(request)
  const bal = await resetDevCredits(session.user.id)
  return { success: true as const, newBalance: bal }
}
