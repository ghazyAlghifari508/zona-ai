import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  artifactDetailSchema,
  artifactIdSchema,
  artifactSummarySchema,
} from '../../lib/artifacts/contracts'
import { getAuthSession } from '../../lib/auth/session'
import {
  getOwnedArtifact,
  listConversationArtifactSummaries,
} from '../core/artifact-repository'

const listConversationArtifactsInputSchema = z.object({
  conversationId: z.string().uuid(),
})
const getArtifactInputSchema = z.object({ artifactId: artifactIdSchema })

export async function listConversationArtifactsCore({
  data,
  request,
}: {
  data: z.infer<typeof listConversationArtifactsInputSchema>
  request: Request
}) {
  const session = await getAuthSession(request)
  const summaries = await listConversationArtifactSummaries({
    userId: session.user.id,
    conversationId: data.conversationId,
  })
  return artifactSummarySchema.array().parse(summaries)
}

export async function getArtifactCore({
  data,
  request,
}: {
  data: z.infer<typeof getArtifactInputSchema>
  request: Request
}) {
  const session = await getAuthSession(request)
  const artifact = await getOwnedArtifact({
    userId: session.user.id,
    artifactId: data.artifactId,
  })
  return artifactDetailSchema.parse(artifact)
}

export const listConversationArtifacts = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    listConversationArtifactsInputSchema.parse(data),
  )
  .handler(async ({ data }) =>
    listConversationArtifactsCore({ data, request: getRequest() }),
  )

export const getArtifact = createServerFn({ method: 'GET' })
  .validator((data: unknown) => getArtifactInputSchema.parse(data))
  .handler(async ({ data }) => getArtifactCore({ data, request: getRequest() }))
