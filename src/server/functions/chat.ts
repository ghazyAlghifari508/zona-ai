import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  artifactSchema,
  chatSchema,
  compareSchema,
} from '../../lib/utils/validation'
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
  .validator((data: unknown) => {
    console.log(
      '[SERVER] sendCompareMessage validator input:',
      JSON.stringify(data),
    )
    try {
      return compareSchema.parse(data)
    } catch (err) {
      console.error('[SERVER] sendCompareMessage validation error:', err)
      throw err
    }
  })
  .handler(async ({ data }) => {
    console.log(
      '[SERVER] sendCompareMessage handler invoked with:',
      JSON.stringify(data),
    )
    const request = getRequest() as Request
    try {
      const res = await sendCompareMessageCore({
        data: data as z.infer<typeof compareSchema>,
        request,
      })
      console.log(
        '[SERVER] sendCompareMessageCore returned successfully status:',
        res.status,
      )
      return res
    } catch (err) {
      console.error('[SERVER] sendCompareMessageCore thrown error:', err)
      throw err
    }
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
