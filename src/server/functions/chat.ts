import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/start-server-core'
import { createTextStreamResponse, streamText, toTextStream } from 'ai'
import { and, asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { nineRouter } from '../../lib/ai/9router'
import { deductCredits } from '../../lib/ai/credits'
import { buildSystemPrompt } from '../../lib/ai/system-prompt'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db/index'
import {
  conversations,
  generationRuns,
  messages,
  usageRecords,
} from '../../lib/db/schema'
import { getModelById } from '../../lib/models/registry'
import { resolveAutoModel } from '../../lib/models/router'
import { generateTitle } from '../../lib/utils/title'
import { chatSchema } from '../../lib/utils/validation'

if (typeof window !== 'undefined') {
  throw new Error('src/server/functions/chat.ts is server-only')
}

const controllers = new Map<string, AbortController>()

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

// Core logic testable without Start context
export async function sendMessageCore({
  data,
  request,
}: {
  data: z.infer<typeof chatSchema>
  request: Request
}): Promise<Response> {
  const session = (await getAuthSession(request)) as unknown as {
    user: { id: string }
  }
  const userId = session.user.id

  const modelEntry = getModelById(data.modelId)
  const input = data

  let routerModelId = modelEntry.routerModelId
  let cost: number
  let routingReason: string | undefined

  const creditRes = await db.execute(
    sql`SELECT credits FROM users WHERE id=${userId}`,
  )
  const creditRows = getRows<{ credits: number }>(creditRes)
  const currentCredits = creditRows[0]?.credits ?? 0

  if (input.modelId === 'auto') {
    const resolved = resolveAutoModel(input.content, {
      credits: currentCredits,
    })
    routerModelId = resolved.routerModelId
    cost = resolved.cost
    routingReason = resolved.reason
  } else {
    cost = modelEntry.creditCost as number
  }

  if (currentCredits < cost) {
    const e = new Error('Kredit tidak mencukupi') as Error & {
      status: number
      code: string
    }
    e.status = 402
    e.code = 'ERR-019'
    throw e
  }

  let convId = input.conversationId
  let conversationTitle: string | null | undefined
  if (convId) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
    if (!conv || conv.userId !== userId) {
      const e = new Error('Forbidden') as Error & { status: number }
      e.status = 403
      throw e
    }
    conversationTitle = conv.title
  } else {
    const [conv] = await db
      .insert(conversations)
      .values({
        userId,
        title: generateTitle(input.content),
        mode: 'normal',
      })
      .returning()
    convId = conv.id
  }

  const [_userMsg] = await db
    .insert(messages)
    .values({ conversationId: convId, role: 'user', content: input.content })
    .returning()

  await db
    .update(conversations)
    .set({
      title:
        conversationTitle === null || conversationTitle === 'New Chat'
          ? generateTitle(input.content)
          : undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))

  const [assistantMsg] = await db
    .insert(messages)
    .values({ conversationId: convId, role: 'assistant', content: '' })
    .returning()

  const genId = crypto.randomUUID()

  const startedAt = new Date()
  let firstTokenAt: number | null = null
  const startTime = Date.now()

  await db.insert(generationRuns).values({
    id: genId,
    messageId: assistantMsg.id,
    conversationId: convId,
    modelId: input.modelId,
    routerModelId,
    skillId: input.skillId,
    status: 'streaming',
    startedAt,
  })

  try {
    await deductCredits({
      userId,
      generationRunId: genId,
      modelId: input.modelId,
      amount: cost,
    })
  } catch (e) {
    await db.delete(generationRuns).where(eq(generationRuns.id, genId))
    throw e
  }

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(asc(messages.createdAt))

  const abortController = new AbortController()
  controllers.set(genId, abortController)

  const aiMessages = history.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }))

  try {
    const result = streamText({
      model: nineRouter(routerModelId),
      system: buildSystemPrompt({ skillId: input.skillId }),
      messages: aiMessages,
      abortSignal: abortController.signal,
      onChunk: () => {
        if (firstTokenAt === null) firstTokenAt = Date.now()
      },
      onFinish: async ({ text, usage, reasoningText }) => {
        const latencyMs = Date.now() - startTime
        const ttft = firstTokenAt ? firstTokenAt - startTime : null
        try {
          const u = usage as unknown as {
            inputTokens?: number
            outputTokens?: number
            totalTokens?: number
            promptTokens?: number
            completionTokens?: number
          }
          await db
            .update(generationRuns)
            .set({
              content: text,
              reasoningContent: reasoningText ?? null,
              promptTokens: u?.inputTokens ?? u?.promptTokens ?? null,
              completionTokens: u?.outputTokens ?? u?.completionTokens ?? null,
              totalTokens: u?.totalTokens ?? null,
              latencyMs,
              timeToFirstTokenMs: ttft,
              status: 'completed',
              completedAt: new Date(),
            })
            .where(eq(generationRuns.id, genId))

          await db
            .update(messages)
            .set({ content: text })
            .where(eq(messages.id, assistantMsg.id))

          if (usage) {
            await db.insert(usageRecords).values({
              userId,
              generationRunId: genId,
              modelId: input.modelId,
              promptTokens: u.inputTokens ?? u.promptTokens ?? 0,
              completionTokens: u.outputTokens ?? u.completionTokens ?? 0,
              totalTokens: u.totalTokens ?? 0,
            })
          }
        } catch (e) {
          console.error('onFinish update failed', e)
        } finally {
          controllers.delete(genId)
        }
      },
      onError: async ({ error }) => {
        try {
          await db
            .update(generationRuns)
            .set({
              status: 'failed',
              error: { message: (error as Error).message } as unknown as never,
              completedAt: new Date(),
            })
            .where(eq(generationRuns.id, genId))
        } catch {}
        controllers.delete(genId)
      },
    })

    const anyResult = result as unknown as Record<string, unknown>
    let response: Response
    if (typeof anyResult.toUIMessageStreamResponse === 'function') {
      response = (
        anyResult.toUIMessageStreamResponse as (o?: unknown) => Response
      ).call(result, {
        headers: {
          'X-Generation-Id': genId,
          'X-Conversation-Id': convId,
          'X-Router-Model-Id': routerModelId,
          ...(routingReason ? { 'X-Routing-Reason': routingReason } : {}),
        },
      })
    } else if (typeof anyResult.toTextStreamResponse === 'function') {
      response = (anyResult.toTextStreamResponse as () => Response).call(result)
    } else {
      response = createTextStreamResponse({
        stream: toTextStream({
          stream: (result as { stream: ReadableStream }).stream,
        }),
        headers: {
          'X-Generation-Id': genId,
          'X-Conversation-Id': convId,
        },
      })
    }

    return response
  } catch (err) {
    controllers.delete(genId)
    await db
      .update(generationRuns)
      .set({
        status: 'failed',
        error: { message: (err as Error).message } as unknown as never,
        completedAt: new Date(),
      })
      .where(eq(generationRuns.id, genId))
    throw err
  }
}

export const sendMessage = createServerFn({ method: 'POST' })
  .validator((data: unknown) => chatSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest() as Request
    return sendMessageCore({
      data: data as z.infer<typeof chatSchema>,
      request,
    })
  })

export async function stopGenerationCore({
  generationId,
  request,
}: {
  generationId: string
  request: Request
}) {
  await getAuthSession(request)
  const ctrl = controllers.get(generationId)
  if (ctrl) ctrl.abort()
  await db
    .update(generationRuns)
    .set({ status: 'cancelled', completedAt: new Date() })
    .where(eq(generationRuns.id, generationId))
  controllers.delete(generationId)
  return { ok: true as const }
}

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

export async function regenerateMessageCore({
  messageId,
  modelId,
  request,
}: {
  messageId: string
  modelId?: string
  request: Request
}) {
  const session = (await getAuthSession(request)) as unknown as {
    user: { id: string }
  }
  const [msg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId))
  if (!msg) throw new Error('Message not found')
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, msg.conversationId))
  if (!conv || conv.userId !== session.user.id) {
    const e = new Error('Forbidden') as Error & { status: number }
    e.status = 403
    throw e
  }

  const targetModelId = modelId ?? 'auto'
  const modelEntry = getModelById(targetModelId)

  let routerModelId = modelEntry.routerModelId
  let cost: number
  if (targetModelId === 'auto') {
    const historyForCost = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conv.id))
      .orderBy(asc(messages.createdAt))
    const lastUser = [...historyForCost]
      .reverse()
      .find((m) => m.role === 'user')
    const resolved = resolveAutoModel(lastUser?.content ?? 'hello', {
      credits: 100,
    })
    routerModelId = resolved.routerModelId
    cost = resolved.cost
  } else {
    cost = modelEntry.creditCost as number
  }

  const creditRes = await db.execute(
    sql`SELECT credits FROM users WHERE id=${session.user.id}`,
  )
  const creditRows = getRows<{ credits: number }>(creditRes)
  const currentCredits = creditRows[0]?.credits ?? 0
  if (currentCredits < cost) {
    const e = new Error('Kredit tidak mencukupi') as Error & {
      status: number
      code: string
    }
    e.status = 402
    e.code = 'ERR-019'
    throw e
  }

  const [assistantMsg] = await db
    .insert(messages)
    .values({ conversationId: conv.id, role: 'assistant', content: '' })
    .returning()

  const genId = crypto.randomUUID()

  await db.insert(generationRuns).values({
    id: genId,
    messageId: assistantMsg.id,
    conversationId: conv.id,
    modelId: targetModelId,
    routerModelId,
    skillId: 'none',
    status: 'streaming',
    startedAt: new Date(),
  })

  try {
    await deductCredits({
      userId: session.user.id,
      generationRunId: genId,
      modelId: targetModelId,
      amount: cost,
    })
  } catch (e) {
    await db.delete(generationRuns).where(eq(generationRuns.id, genId))
    throw e
  }

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conv.id))
    .orderBy(asc(messages.createdAt))

  const abortController = new AbortController()
  controllers.set(genId, abortController)

  const result = streamText({
    model: nineRouter(routerModelId),
    system: buildSystemPrompt({ skillId: 'none' }),
    messages: history.map((m) => ({
      role: m.role as unknown as 'user',
      content: m.content,
    })),
    abortSignal: abortController.signal,
    onFinish: async ({ text, usage }) => {
      const u = usage as unknown as {
        inputTokens?: number
        outputTokens?: number
        totalTokens?: number
      }
      await db
        .update(generationRuns)
        .set({
          content: text,
          promptTokens: u?.inputTokens ?? null,
          completionTokens: u?.outputTokens ?? null,
          totalTokens: u?.totalTokens ?? null,
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(generationRuns.id, genId))
      await db
        .update(messages)
        .set({ content: text })
        .where(eq(messages.id, assistantMsg.id))
      controllers.delete(genId)
    },
  })

  const anyResult = result as unknown as Record<string, unknown>
  if (typeof anyResult.toUIMessageStreamResponse === 'function') {
    return (anyResult.toUIMessageStreamResponse as () => Response).call(result)
  }
  return createTextStreamResponse({
    stream: toTextStream({
      stream: (result as { stream: unknown }).stream as ReadableStream,
    }),
  } as never)
}

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

export const _controllers = controllers
