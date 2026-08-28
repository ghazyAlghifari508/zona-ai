import { createServerFn } from '@tanstack/react-start'
import { getAuthSession } from '../../lib/auth/session'
import { resetDevCredits } from '../../lib/ai/credits'

export const resetDevCreditsFn = createServerFn({ method: 'POST' }).handler(
  async ({ request }) => {
    if (process.env.NODE_ENV === 'production') throw new Error('Forbidden')
    const session = (await getAuthSession(request as Request)) as unknown as {
      user: { id: string }
    }
    const bal = await resetDevCredits(session.user.id)
    return { success: true as const, newBalance: bal }
  },
)
