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
          const err = e as Error & {
            status?: number
            code?: string
            retryAfterSeconds?: number
          }
          const status = err.status ?? 500
          const message =
            status < 500
              ? err.message
              : 'Terjadi kesalahan pada server saat mengunggah file.'
          const code = status < 500 ? err.code : 'ERR-000'
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          }
          if (status === 429 && err.retryAfterSeconds) {
            headers['Retry-After'] = String(err.retryAfterSeconds)
          }
          if (status >= 500) {
            console.error('File upload internal error:', e)
          }
          return new Response(JSON.stringify({ message, code, status }), {
            status,
            headers,
          })
        }
      },
    },
  },
})
