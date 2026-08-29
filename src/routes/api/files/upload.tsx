import { createFileRoute } from '@tanstack/react-router'
import { uploadFileCore } from '@/server/functions/files'

export const Route = createFileRoute('/api/files/upload')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const result = await uploadFileCore({ request })
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e) {
          const err = e as Error & { status?: number; code?: string }
          const status = err.status ?? 500
          const code = err.code
          return new Response(
            JSON.stringify({ message: err.message, code, status }),
            {
              status,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
