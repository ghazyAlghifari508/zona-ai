import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { artifactIdSchema } from '../../lib/artifacts/contracts'
import {
  getArtifactCore,
  listConversationArtifactsCore,
} from '../core/artifact-reads.server'

const listConversationArtifactsInputSchema = z.object({
  conversationId: z.string().uuid(),
})
const getArtifactInputSchema = z.object({ artifactId: artifactIdSchema })

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
