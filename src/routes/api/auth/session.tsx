import { createFileRoute } from '@tanstack/react-router'
import { getAuthSession } from '@/lib/auth/session'

export const Route = createFileRoute('/api/auth/session')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const session = await getAuthSession(request)
          return Response.json(session)
        } catch (e: unknown) {
          const err = e as { status?: number; code?: string; message?: string }
          if (err.status === 401) {
            return new Response(JSON.stringify({ code: err.code, message: err.message }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          throw e
        }
      },
    },
  },
})
