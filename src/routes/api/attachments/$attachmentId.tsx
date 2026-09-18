import { createFileRoute } from '@tanstack/react-router'
import {
  deleteAttachmentCore,
  getAttachmentCore,
} from '@/server/functions/files'

export const Route = createFileRoute('/api/attachments/$attachmentId')({
  server: {
    handlers: {
      GET: async ({
        request,
        params,
      }: {
        request: Request
        params: { attachmentId: string }
      }) => {
        try {
          const url = new URL(request.url)
          const download = url.searchParams.get('download') === '1'
          const result = await getAttachmentCore({
            data: { id: params.attachmentId, download },
            request,
          })
          return result
        } catch (e) {
          const err = e as Error & { status?: number; code?: string }
          const status = err.status ?? 500
          return new Response(
            JSON.stringify({
              message:
                status >= 500
                  ? 'Terjadi kesalahan pada lampiran.'
                  : err.message,
              code: err.code,
              status,
            }),
            {
              status,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
      DELETE: async ({
        request,
        params,
      }: {
        request: Request
        params: { attachmentId: string }
      }) => {
        try {
          const result = await deleteAttachmentCore({
            data: { id: params.attachmentId },
            request,
          })
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e) {
          const err = e as Error & { status?: number; code?: string }
          const status = err.status ?? 500
          return new Response(
            JSON.stringify({
              message:
                status >= 500
                  ? 'Terjadi kesalahan pada lampiran.'
                  : err.message,
              code: err.code,
              status,
            }),
            {
              status,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      },
      POST: async ({
        request,
        params,
      }: {
        request: Request
        params: { attachmentId: string }
      }) => {
        // fallback for delete via POST with route param
        try {
          const body = await request.json().catch(() => ({}))
          const bodyId = (body as { id?: string }).id
          if (bodyId && bodyId !== params.attachmentId) {
            return new Response(
              JSON.stringify({
                message: 'ID lampiran tidak cocok dengan URL.',
                code: 'ERR-001',
                status: 400,
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }
          const result = await deleteAttachmentCore({
            data: { id: params.attachmentId },
            request,
          })
          return new Response(JSON.stringify(result), {
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (e) {
          const err = e as Error & { status?: number; code?: string }
          const status = err.status ?? 500
          return new Response(
            JSON.stringify({
              message:
                status >= 500
                  ? 'Terjadi kesalahan pada lampiran.'
                  : err.message,
              code: err.code,
              status,
            }),
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
