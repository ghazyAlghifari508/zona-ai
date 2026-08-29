import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { resetDevCredits } from '../../lib/ai/credits'
import { getAuthSession } from '../../lib/auth/session'

export async function resetDevCreditsCore({ request }: { request: Request }) {
  if (process.env.NODE_ENV === 'production') throw new Error('Forbidden')
  const session = await getAuthSession(request)
  const bal = await resetDevCredits(session.user.id)
  return { success: true as const, newBalance: bal }
}

export const resetDevCreditsFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const request = getRequest() as Request
    return resetDevCreditsCore({ request })
  },
)
