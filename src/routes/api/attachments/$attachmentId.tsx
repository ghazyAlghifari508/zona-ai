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
          const result = await getAttachmentCore({
            data: { id: params.attachmentId },
            request,
          })
          return result
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
            JSON.stringify({ message: err.message, code: err.code, status }),
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
        // fallback for delete via POST with body {id}
        try {
          const body = await request.json().catch(() => ({}))
          const id = (body as { id?: string }).id ?? params.attachmentId
          const result = await deleteAttachmentCore({
            data: { id },
            request,
          })
          return new Response(JSON.stringify(result), {
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
