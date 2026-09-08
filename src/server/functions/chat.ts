import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  artifactOperationSchema,
  artifactSchema,
  chatSchema,
  compareArtifactSchema,
  compareSchema,
} from '../../lib/utils/validation'
import {
  generateArtifactsCore,
  generateCompareArtifactsCore,
} from '../core/artifact-generation'
import { generateArtifactCore } from '../core/artifacts'
import {
  getComparisonRunsCore,
  retryGenerationCore,
  sendCompareMessageCore,
  sendMessageCore,
  stopGenerationCore,
} from '../core/chat'
import { generatePrdArtifactCore } from '../core/prd'

export const generateArtifact = createServerFn({ method: 'POST' })
  .validator((data: unknown) => artifactSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return generateArtifactCore({
      data: data as z.infer<typeof artifactSchema>,
      request,
    })
  })

const generateArtifactsRequestSchema = z.object({
  conversationId: z.string().uuid().optional(),
  modelId: z.string().min(1),
  content: z.string().min(1).max(20000),
  operation: artifactOperationSchema,
  attachmentIds: z.array(z.string().uuid()).optional(),
  enableWebSearch: z.boolean().optional().default(false),
})

export const generateArtifacts = createServerFn({ method: 'POST' })
  .validator((data: unknown) => generateArtifactsRequestSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return generateArtifactsCore({
      data: data as z.infer<typeof generateArtifactsRequestSchema>,
      request,
    })
  })

export const generateCompareArtifacts = createServerFn({ method: 'POST' })
  .validator((data: unknown) => compareArtifactSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return generateCompareArtifactsCore({
      data: data as z.infer<typeof compareArtifactSchema>,
      request,
    })
  })

export const generatePrdArtifact = createServerFn({ method: 'POST' })
  .validator((data: unknown) => chatSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return generatePrdArtifactCore({
      data: data as z.infer<typeof chatSchema>,
      request,
    })
  })

export const sendMessage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => chatSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return sendMessageCore({
      data: data as z.infer<typeof chatSchema>,
      request,
    })
  })

export const sendCompareMessage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => compareSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return sendCompareMessageCore({
      data: data as z.infer<typeof compareSchema>,
      request,
    })
  })

export const getComparisonRuns = createServerFn({ method: 'GET' })
  .validator((data: unknown) =>
    z.object({ conversationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    const res = await getComparisonRunsCore({
      conversationId: (data as { conversationId: string }).conversationId,
      request,
    })
    return res
  })

export const retryGeneration = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z.object({ generationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return retryGenerationCore({
      generationId: (data as { generationId: string }).generationId,
      request,
    })
  })

export const stopGeneration = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z.object({ generationId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return stopGenerationCore({
      generationId: (data as { generationId: string }).generationId,
      request,
    })
  })
