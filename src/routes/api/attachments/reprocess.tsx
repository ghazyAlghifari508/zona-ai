import { createFileRoute } from '@tanstack/react-router'
import { reprocessAttachmentCore } from '@/server/functions/files'

export const Route = createFileRoute('/api/attachments/reprocess')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const body = (await request.json().catch(() => ({}))) as {
            id?: string
          }
          const id = body.id
          if (!id) {
            return new Response(JSON.stringify({ message: 'id required' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          const result = await reprocessAttachmentCore({
            data: { id },
            request,
          })
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e) {
          const err = e as Error & { status?: number; code?: string }
          const status = err.status ?? 500
          return new Response(
            JSON.stringify({ message: err.message, code: err.code, status }),
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
