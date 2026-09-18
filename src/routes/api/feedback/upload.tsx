import { createFileRoute } from '@tanstack/react-router'
import { AppError } from '@/lib/utils/errors'
import { uploadFeedbackAttachmentCore } from '@/server/core/feedback'

export const Route = createFileRoute('/api/feedback/upload')({
  server: {
    handlers: {
      POST: async ({ request }: { request: Request }) => {
        try {
          const result = await uploadFeedbackAttachmentCore({ request })
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          if (error instanceof AppError) {
            return new Response(
              JSON.stringify({
                message: error.message,
                code: error.code,
                status: error.status,
              }),
              {
                status: error.status,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          console.error('Feedback upload internal error:', error)
          return new Response(
            JSON.stringify({
              message: 'Terjadi kesalahan saat mengunggah lampiran.',
              code: 'ERR-000',
              status: 500,
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
    },
  },
})
