import { createFileRoute } from '@tanstack/react-router'
import {
  artifactIdSchema,
  artifactVersionIdSchema,
} from '@/lib/artifacts/contracts'
import { getAuthSession } from '@/lib/auth/session'
import { AppError } from '@/lib/utils/errors'
import { readArtifactVersionContentCore } from '@/server/core/artifact-workspace'

type ArtifactVersionRouteInput = {
  request: Request
  params: { artifactId: string; versionId: string }
}

function errorResponse(error: unknown): Response {
  const appError =
    error instanceof AppError
      ? error
      : new AppError('Artifact content is unavailable.', 500, 'ERR-013')
  return Response.json(
    {
      message: appError.message,
      code: appError.code,
      status: appError.status,
    },
    { status: appError.status },
  )
}

export async function getArtifactVersionRoute({
  request,
  params,
}: ArtifactVersionRouteInput): Promise<Response> {
  try {
    const parsedArtifactId = artifactIdSchema.safeParse(params.artifactId)
    const parsedVersionId = artifactVersionIdSchema.safeParse(params.versionId)
    if (!parsedArtifactId.success || !parsedVersionId.success) {
      throw new AppError('Invalid artifact version.', 400, 'ERR-003')
    }

    const session = await getAuthSession(request)
    const result = await readArtifactVersionContentCore({
      userId: session.user.id,
      artifactId: parsedArtifactId.data,
      versionId: parsedVersionId.data,
    })
    const etag = `"${result.contentSha256}"`
    const headers = new Headers({
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Length': String(result.bytes.byteLength),
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      ETag: etag,
    })

    if (request.headers.get('If-None-Match') === etag) {
      return new Response(null, { status: 304, headers })
    }

    return new Response(Uint8Array.from(result.bytes), { status: 200, headers })
  } catch (error) {
    return errorResponse(error)
  }
}

export const Route = createFileRoute(
  '/api/artifacts/$artifactId/versions/$versionId',
)({
  server: {
    handlers: {
      GET: getArtifactVersionRoute,
    },
  },
})
