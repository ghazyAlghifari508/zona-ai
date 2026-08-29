import { createFileRoute } from '@tanstack/react-router'
import { getAttachmentsCore } from '@/server/functions/files'

export const Route = createFileRoute('/api/attachments/')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          const url = new URL(request.url)
          const conversationId = url.searchParams.get('conversationId')
          if (!conversationId) {
            return new Response(
              JSON.stringify({ message: 'conversationId required' }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
          const result = await getAttachmentsCore({
            data: { conversationId },
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
