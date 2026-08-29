import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import { chatSchema, compareSchema } from '../../lib/utils/validation'
import {
  getComparisonRunsCore,
  regenerateMessageCore,
  retryGenerationCore,
  sendCompareMessageCore,
  sendMessageCore,
  stopGenerationCore,
} from '../core/chat'
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

export const regenerateMessage = createServerFn({ method: 'POST' })
  .validator((data: unknown) =>
    z
      .object({ messageId: z.string().uuid(), modelId: z.string().optional() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    const { messageId, modelId } = data as {
      messageId: string
      modelId?: string
    }
    return regenerateMessageCore({ messageId, modelId, request })
  })
