import { createFileRoute, redirect } from '@tanstack/react-router'
import { getCurrentSession } from '@/server/functions/session'

export const Route = createFileRoute('/chat/')({
  beforeLoad: async () => {
    try {
      await getCurrentSession()
    } catch {
      throw redirect({ to: '/auth/sign-in' })
    }
    throw redirect({ to: '/' })
  },
})
