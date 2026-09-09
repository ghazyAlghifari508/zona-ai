import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { requireAdminSession } from '@/lib/auth/admin-guard'
import { db } from '@/lib/db/index'
import { feedback } from '@/lib/db/schema'
import { env } from '@/lib/env.server'
import { getObject } from '@/lib/r2/client'
import { AppError } from '@/lib/utils/errors'

export const Route = createFileRoute('/api/feedback/attachment')({
  server: {
    handlers: {
      GET: async ({ request }: { request: Request }) => {
        try {
          await requireAdminSession(request)
          const url = new URL(request.url)
          const feedbackId = url.searchParams.get('id')
          if (!feedbackId) {
            throw new AppError('Parameter id diperlukan.', 400, 'ERR-011')
          }

          const [item] = await db
            .select()
            .from(feedback)
            .where(eq(feedback.id, feedbackId))

          if (!item?.attachmentR2Key) {
            throw new AppError('Lampiran tidak ditemukan.', 404, 'ERR-003')
          }

          const { body, contentType } = await getObject({
            bucket: env.R2_BUCKET_NAME,
            key: item.attachmentR2Key,
          })

          const mimeType =
            item.attachmentMimeType || contentType || 'application/octet-stream'
          const fileName = item.attachmentFileName || 'attachment'

          return new Response(new Uint8Array(body), {
            headers: {
              'Content-Type': mimeType,
              'Content-Disposition': `inline; filename="${fileName}"`,
              'Content-Length': String(body.length),
              'Cache-Control': 'private, max-age=3600',
              'X-Content-Type-Options': 'nosniff',
            },
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

          return new Response(
            JSON.stringify({
              message: 'Terjadi kesalahan saat memuat berkas lampiran.',
              code: 'ERR-500',
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
