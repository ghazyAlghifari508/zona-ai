import '@tanstack/react-start/server-only'
import {
  artifactDetailSchema,
  artifactSummarySchema,
} from '../../lib/artifacts/contracts'
import { getAuthSession } from '../../lib/auth/session'
import {
  getOwnedArtifact,
  listConversationArtifactSummaries,
} from './artifact-repository'

export async function listConversationArtifactsCore({
  data,
  request,
}: {
  data: { conversationId: string }
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
  data: { artifactId: string }
  request: Request
}) {
  const session = await getAuthSession(request)
  const artifact = await getOwnedArtifact({
    userId: session.user.id,
    artifactId: data.artifactId,
  })
  return artifactDetailSchema.parse(artifact)
}
