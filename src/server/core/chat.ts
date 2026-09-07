import type { ModelMessage } from 'ai'
import { createTextStreamResponse, streamText, toTextStream } from 'ai'
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { nineRouter } from '../../lib/ai/9router'
import {
  deductCompareCredits,
  deductCredits,
  refundCredits,
} from '../../lib/ai/credits'
import { createMultiplexStream, type StreamEvent } from '../../lib/ai/multiplex'
import { buildSystemPrompt } from '../../lib/ai/system-prompt'
import { getAuthSession } from '../../lib/auth/session'
import { isArtifactSkill, skillSupportsCompare } from '../../lib/chat/skills'
import { generateAiTitle } from '../../lib/chat/title'
import { db } from '../../lib/db/index'
import {
  attachments,
  comparisonRuns,
  conversations,
  creditTransactions,
  documentChunks,
  generationRuns,
  messages,
  usageRecords,
  webSources,
} from '../../lib/db/schema'
import { getModelById, isVisionCapable } from '../../lib/models/registry'
import { resolveAutoModel } from '../../lib/models/router'
import { retrieveContext } from '../../lib/rag/retrieve'
import { enforceRateLimit } from '../../lib/security/rate-limit'
import { searchProvider } from '../../lib/tavily/client'
import {
  RATE_LIMIT_CHAT_PER_MINUTE,
  RATE_LIMIT_COMPARE_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
  TAVILY_MAX_RESULTS,
} from '../../lib/utils/constants'
import {
  AppError,
  throwZonaError,
  type UsageLike,
} from '../../lib/utils/errors'
import { generateTitle } from '../../lib/utils/title'
import { type chatSchema, compareSchema } from '../../lib/utils/validation'
import { finalizeTerminalRun, retryArtifactGenerationCore } from './artifacts'
import { buildModelHistory } from './history'

export async function autoTitleConversation(
  convId: string,
  prompt: string,
): Promise<void> {
  try {
    const aiTitle = await generateAiTitle({ prompt })
    const title = aiTitle ?? generateTitle(prompt)
    await db
      .update(conversations)
      .set({ title })
      .where(
        and(
          eq(conversations.id, convId),
          or(isNull(conversations.title), eq(conversations.title, 'New Chat')),
        ),
      )
  } catch {
    // titling is best-effort; placeholder remains
  }
}

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/chat.ts is server-only')
}

export const controllers = new Map<string, AbortController>()

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

async function waitForOneCompareGenerationTerminal(
  genId: string,
  timeoutMs = 30000,
): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const [row] = await db
      .select({ status: generationRuns.status })
      .from(generationRuns)
      .where(eq(generationRuns.id, genId))
    if (row && row.status !== 'streaming') return row.status
    await new Promise((r) => setTimeout(r, 100))
  }
  throw new Error(`Generation ${genId} did not reach terminal in time`)
}

export async function settleComparisonRunBarrier(
  comparisonRunId: string,
  generationIds: string[],
  timeoutMs = 30000,
): Promise<string> {
  await Promise.allSettled(
    generationIds.map((genId) =>
      waitForOneCompareGenerationTerminal(genId, timeoutMs),
    ),
  )
  const gens = await db
    .select({ status: generationRuns.status })
    .from(generationRuns)
    .where(eq(generationRuns.comparisonRunId, comparisonRunId))
  if (gens.length === 0) return 'running'
  const terminal = gens.filter((g) => g.status !== 'streaming')
  if (terminal.length !== gens.length) return 'running'
  const statuses = gens.map((g) => g.status)
  const completed = statuses.filter((s) => s === 'completed').length
  const failed = statuses.filter((s) => s === 'failed').length
  const cancelled = statuses.filter((s) => s === 'cancelled').length
  let finalStatus: string
  if (gens.length > 0 && completed === gens.length) finalStatus = 'completed'
  else if (gens.length > 0 && failed === gens.length) finalStatus = 'failed'
  else if (gens.length > 0 && cancelled === gens.length)
    finalStatus = 'cancelled'
  else finalStatus = 'partial_failure'
  await db
    .update(comparisonRuns)
    .set({ status: finalStatus, completedAt: new Date() })
    .where(eq(comparisonRuns.id, comparisonRunId))
  return finalStatus
}

// Core logic testable without Start context
export async function sendMessageCore({
  data,
  request,
}: {
  data: z.infer<typeof chatSchema>
  request: Request
}): Promise<Response> {
  const session = await getAuthSession(request)
  const userId = session.user.id

  // Rate limit before any DB write / credit deduction (SECURITY.md �13)
  enforceRateLimit({
    key: `chat:${userId}`,
    limit: RATE_LIMIT_CHAT_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })

  if (isArtifactSkill(data.skillId)) {
    throw new AppError(
      'Skill artifact hanya tersedia melalui pembuatan artifact.',
      400,
      'ERR-003',
    )
  }

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
    cost =
      typeof modelEntry.creditCost === 'number'
        ? modelEntry.creditCost
        : modelEntry.creditCost.max
  }

  if (currentCredits < cost) {
    throwZonaError('ERR-019')
  }

  let convId = input.conversationId
  let conversationTitle: string | null | undefined
  if (convId) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
    if (!conv || conv.userId !== userId) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    conversationTitle = conv.title
  } else {
    const [conv] = await db
      .insert(conversations)
      .values({
        userId,
        title: 'New Chat',
        mode: 'normal',
      })
      .returning()
    convId = conv.id
  }

  const shouldAutoTitle =
    !input.conversationId ||
    conversationTitle === null ||
    conversationTitle === 'New Chat'
  if (shouldAutoTitle) {
    void autoTitleConversation(convId, input.content)
  }

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))

  const [_userMsg] = await db
    .insert(messages)
    .values({ conversationId: convId, role: 'user', content: input.content })
    .returning()

  const [assistantMsg] = await db
    .insert(messages)
    .values({ conversationId: convId, role: 'assistant', content: '' })
    .returning()

  const fileParts: Array<{ type: 'file'; data: string; mediaType: string }> = []
  if (input.attachmentIds?.length) {
    const atts = await db
      .select()
      .from(attachments)
      .where(
        and(
          inArray(attachments.id, input.attachmentIds),
          eq(attachments.userId, userId),
        ),
      )
    if (atts.length !== input.attachmentIds.length) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    for (const a of atts) {
      if (a.conversationId !== convId) {
        throw new AppError('Attachment not in conversation', 400, 'ERR-003')
      }
    }
    const hasImage = atts.some((a) => a.mimeType.startsWith('image/'))
    if (hasImage && !isVisionCapable(input.modelId)) {
      throw new AppError(
        'Model tidak mendukung vision. Pilih model vision-capable.',
        400,
        'ERR-003',
      )
    }
    const { getObject } = await import('../../lib/r2/client')
    for (const a of atts.filter((x) => x.mimeType.startsWith('image/'))) {
      const { body } = await getObject({
        bucket: a.r2Bucket,
        key: a.r2Key,
      })
      fileParts.push({
        type: 'file',
        data: (body as Buffer).toString('base64'),
        mediaType: a.mimeType,
      })
    }
    for (const id of input.attachmentIds) {
      await db
        .update(attachments)
        .set({ messageId: _userMsg.id })
        .where(eq(attachments.id, id))
    }
  }

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

  const aiMessages: ModelMessage[] = await buildModelHistory(convId)

  let ragContext: string[] = []
  try {
    const hasChunks =
      (
        await db
          .select()
          .from(documentChunks)
          .where(eq(documentChunks.conversationId, convId))
          .limit(1)
      ).length > 0
    if (hasChunks || input.attachmentIds?.length) {
      ragContext = await retrieveContext({
        conversationId: convId,
        query: input.content,
      })
    }
  } catch (e) {
    console.error('retrieve failed', e)
  }
  let ragSuffix = ''
  if (ragContext.length) {
    const joined = ragContext.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')
    const truncated = joined.length > 4000 ? joined.slice(0, 4000) : joined
    ragSuffix = `\n\nContext from documents:\n${truncated}`
  }

  let webResults: Array<{
    url: string
    title: string
    content: string
    score: number
  }> = []
  let webSearchFailed = false
  if (input.enableWebSearch) {
    try {
      webResults = await searchProvider.search(input.content, {
        searchDepth: 'basic',
        maxResults: TAVILY_MAX_RESULTS,
      })
    } catch (e) {
      console.error('Tavily ERR-015', e)
      webResults = []
      webSearchFailed = true
    }
    if (webResults.length) {
      for (let i = 0; i < webResults.length; i++) {
        const r = webResults[i]
        await db.insert(webSources).values({
          generationRunId: genId,
          conversationId: convId,
          url: r.url,
          title: r.title,
          snippet: r.content.slice(0, 500),
          score: r.score,
          position: i,
        })
      }
    }
  }
  const hasWeb = webResults.length > 0
  const webContext = hasWeb
    ? `\n\nWeb context (cite as [1], [2]):\n${webResults.map((r, i) => `[${i + 1}] ${r.title} - ${r.url}\n${r.content.slice(0, 500)}`).join('\n\n')}`
    : ''
  const systemPrompt =
    buildSystemPrompt({ skillId: input.skillId, hasWebSources: hasWeb }) +
    ragSuffix +
    webContext

  const abortController = new AbortController()
  controllers.set(genId, abortController)

  if (fileParts.length) {
    for (let i = aiMessages.length - 1; i >= 0; i--) {
      if (aiMessages[i].role === 'user') {
        const current = aiMessages[i]
        if (typeof current.content === 'string') {
          current.content = [
            { type: 'text', text: input.content },
            ...fileParts,
          ] as ModelMessage['content']
        }
        break
      }
    }
  }

  try {
    const result = streamText({
      model: nineRouter(routerModelId),
      system: systemPrompt,
      messages: aiMessages,
      abortSignal: abortController.signal,
      onChunk: () => {
        if (firstTokenAt === null) firstTokenAt = Date.now()
      },
      onFinish: async ({ text, usage, reasoningText }) => {
        const latencyMs = Date.now() - startTime
        const ttft = firstTokenAt ? firstTokenAt - startTime : null
        const hasFinalAnswer = Boolean(text && text.trim().length > 0)
        try {
          const u = usage as UsageLike
          if (hasFinalAnswer) {
            await db
              .update(generationRuns)
              .set({
                content: text,
                reasoningContent: reasoningText ?? null,
                promptTokens: u?.inputTokens ?? u?.promptTokens ?? null,
                completionTokens:
                  u?.outputTokens ?? u?.completionTokens ?? null,
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
          } else {
            await db
              .update(generationRuns)
              .set({
                content: '',
                reasoningContent: reasoningText ?? null,
                status: 'failed',
                error: {
                  message: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
                  code: 'ERR-001',
                },
                latencyMs,
                timeToFirstTokenMs: ttft,
                completedAt: new Date(),
              })
              .where(eq(generationRuns.id, genId))
            await refundCredits({
              userId,
              generationRunId: genId,
              modelId: input.modelId,
              amount: cost,
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
              error: { message: (error as Error).message },
              completedAt: new Date(),
            })
            .where(eq(generationRuns.id, genId))
        } catch {}
        controllers.delete(genId)
      },
    })

    // cast boundary: AI SDK StreamTextResult version variance
    const anyResult = result as {
      toUIMessageStreamResponse?: (opts?: unknown) => Response
      toTextStreamResponse?: () => Response
      stream?: ReadableStream
      textStream?: ReadableStream<string>
    }
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
          ...(webSearchFailed ? { 'X-Web-Search-Status': 'unavailable' } : {}),
        },
      })
    } else if (typeof anyResult.toTextStreamResponse === 'function') {
      response = (anyResult.toTextStreamResponse as () => Response).call(result)
      if (webSearchFailed) {
        response.headers.set('X-Web-Search-Status', 'unavailable')
      }
    } else {
      response = createTextStreamResponse({
        stream: toTextStream({
          stream: (result as { stream: ReadableStream }).stream,
        }),
        headers: {
          'X-Generation-Id': genId,
          'X-Conversation-Id': convId,
          ...(webSearchFailed ? { 'X-Web-Search-Status': 'unavailable' } : {}),
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
        error: { message: (err as Error).message },
        completedAt: new Date(),
      })
      .where(eq(generationRuns.id, genId))
    throw err
  }
}

export async function sendCompareMessageCore({
  data: rawData,
  request,
}: {
  data: z.infer<typeof compareSchema>
  request: Request
}): Promise<Response> {
  const data = compareSchema.parse(rawData) as z.infer<typeof compareSchema>
  const session = await getAuthSession(request)
  const userId = session.user.id

  // Rate limit before any DB write / credit deduction (SECURITY.md �13)
  enforceRateLimit({
    key: `compare:${userId}`,
    limit: RATE_LIMIT_COMPARE_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })

  if (!skillSupportsCompare(data.skillId)) {
    throw new AppError(
      'Skill ini hanya tersedia untuk mode single model.',
      400,
      'ERR-003',
    )
  }

  // Validate enabled and collect costs/routerIds
  const costs: number[] = []
  const routerModelIds: string[] = []
  for (const mid of data.modelIds) {
    try {
      const entry = getModelById(mid)
      costs.push(
        typeof entry.creditCost === 'number'
          ? entry.creditCost
          : entry.creditCost.max,
      )
      routerModelIds.push(entry.routerModelId)
    } catch {
      throwZonaError('ERR-003', mid)
    }
  }
  const total = costs.reduce((a, b) => a + b, 0)

  const creditRes = await db.execute(
    sql`SELECT credits FROM users WHERE id=${userId}`,
  )
  const creditRows = getRows<{ credits: number }>(creditRes)
  const currentCredits = creditRows[0]?.credits ?? 0
  if (currentCredits < total) {
    throw new AppError(
      `Kredit tidak mencukupi. Butuh ${total} (Sisa ${currentCredits})`,
      402,
      'ERR-019',
    )
  }

  let convId = data.conversationId
  let conversationTitle: string | null | undefined
  if (convId) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, convId))
    if (!conv || conv.userId !== userId) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    conversationTitle = conv.title
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, convId))
  } else {
    const [conv] = await db
      .insert(conversations)
      .values({ userId, title: 'New Chat' })
      .returning()
    convId = conv.id
  }

  const [userMsg] = await db
    .insert(messages)
    .values({ conversationId: convId, role: 'user', content: data.content })
    .returning()

  const shouldAutoTitle =
    !data.conversationId ||
    conversationTitle === null ||
    conversationTitle === 'New Chat'
  if (shouldAutoTitle) {
    void autoTitleConversation(convId, data.content)
  }

  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(and(eq(conversations.id, convId), eq(conversations.userId, userId)))

  const fileParts: Array<{ type: 'file'; data: string; mediaType: string }> = []
  if (data.attachmentIds?.length) {
    const atts = await db
      .select()
      .from(attachments)
      .where(
        and(
          inArray(attachments.id, data.attachmentIds),
          eq(attachments.userId, userId),
        ),
      )
    if (atts.length !== data.attachmentIds.length) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    for (const a of atts) {
      if (a.conversationId !== convId) {
        throw new AppError('Attachment not in conversation', 400, 'ERR-003')
      }
    }
    const hasImage = atts.some((a) => a.mimeType.startsWith('image/'))
    if (hasImage) {
      for (const mid of data.modelIds) {
        if (!isVisionCapable(mid)) {
          throw new AppError(
            'Model tidak mendukung vision. Pilih model vision-capable.',
            400,
            'ERR-003',
          )
        }
      }
    }
    const { getObject } = await import('../../lib/r2/client')
    for (const a of atts.filter((x) => x.mimeType.startsWith('image/'))) {
      const { body } = await getObject({
        bucket: a.r2Bucket,
        key: a.r2Key,
      })
      fileParts.push({
        type: 'file',
        data: (body as Buffer).toString('base64'),
        mediaType: a.mimeType,
      })
    }
    for (const id of data.attachmentIds) {
      await db
        .update(attachments)
        .set({ messageId: userMsg.id })
        .where(eq(attachments.id, id))
    }
  }

  const genIds = data.modelIds.map(() => crypto.randomUUID())

  // Create assistant messages and generation runs before deduct? deduct must be before 9Router but after creation of gen ids
  // We create messages and generation runs first so that creditTransactions FK is valid
  const assistantMessages: (typeof messages.$inferSelect)[] = []
  for (let i = 0; i < data.modelIds.length; i++) {
    const [am] = await db
      .insert(messages)
      .values({ conversationId: convId, role: 'assistant', content: '' })
      .returning()
    assistantMessages.push(am)
  }
  // Insert generation runs
  const startedAt = new Date()
  for (let i = 0; i < data.modelIds.length; i++) {
    await db.insert(generationRuns).values({
      id: genIds[i],
      messageId: assistantMessages[i].id,
      comparisonRunId: null,
      conversationId: convId,
      modelId: data.modelIds[i],
      routerModelId: routerModelIds[i],
      skillId: data.skillId,
      status: 'streaming',
      startedAt,
    })
  }

  try {
    await deductCompareCredits({
      userId,
      generationRunIds: genIds,
      modelIds: data.modelIds,
      costs,
    })
  } catch (e) {
    // cleanup generation runs on deduct failure
    for (const gid of genIds) {
      await db.delete(generationRuns).where(eq(generationRuns.id, gid))
    }
    for (const am of assistantMessages) {
      await db.delete(messages).where(eq(messages.id, am.id))
    }
    throw e
  }

  const [compRun] = await db
    .insert(comparisonRuns)
    .values({
      conversationId: convId,
      userMessageId: userMsg.id,
      modelIds: data.modelIds,
      status: 'running',
    })
    .returning()

  // update generationRuns with comparisonRunId
  for (const gid of genIds) {
    await db
      .update(generationRuns)
      .set({ comparisonRunId: compRun.id })
      .where(eq(generationRuns.id, gid))
  }

  await db
    .update(conversations)
    .set({ mode: 'compare', updatedAt: new Date() })
    .where(eq(conversations.id, convId))

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, convId))
    .orderBy(asc(messages.createdAt))

  let ragContext: string[] = []
  try {
    const hasChunks =
      (
        await db
          .select()
          .from(documentChunks)
          .where(eq(documentChunks.conversationId, convId))
          .limit(1)
      ).length > 0
    if (hasChunks || data.attachmentIds?.length) {
      ragContext = await retrieveContext({
        conversationId: convId,
        query: data.content,
      })
    }
  } catch (e) {
    console.error('retrieve failed', e)
  }
  let ragSuffix = ''
  if (ragContext.length) {
    const joined = ragContext.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')
    const truncated = joined.length > 4000 ? joined.slice(0, 4000) : joined
    ragSuffix = `\n\nContext from documents:\n${truncated}`
  }

  let webResultsCompare: Array<{
    url: string
    title: string
    content: string
    score: number
  }> = []
  let webSearchFailedCompare = false
  if (data.enableWebSearch) {
    try {
      webResultsCompare = await searchProvider.search(data.content, {
        maxResults: TAVILY_MAX_RESULTS,
      })
    } catch (e) {
      console.error('Tavily ERR-015', e)
      webResultsCompare = []
      webSearchFailedCompare = true
    }
    if (webResultsCompare.length) {
      for (const genId of genIds) {
        for (let i = 0; i < webResultsCompare.length; i++) {
          const r = webResultsCompare[i]
          await db.insert(webSources).values({
            generationRunId: genId,
            conversationId: convId,
            url: r.url,
            title: r.title,
            snippet: r.content.slice(0, 500),
            score: r.score,
            position: i,
          })
        }
      }
    }
  }
  const hasWebCompare = webResultsCompare.length > 0
  const webContextCompare = hasWebCompare
    ? `\n\nWeb context (cite as [1], [2]):\n${webResultsCompare.map((r, i) => `[${i + 1}] ${r.title} - ${r.url}\n${r.content.slice(0, 500)}`).join('\n\n')}`
    : ''
  const systemPrompt =
    buildSystemPrompt({
      skillId: data.skillId,
      hasWebSources: hasWebCompare,
    }) +
    ragSuffix +
    webContextCompare

  const aiMessages: ModelMessage[] = history.map(
    (m) =>
      ({
        role: m.role as 'user' | 'assistant' | 'system',
        content: m.content,
      }) as ModelMessage,
  )
  if (fileParts.length) {
    for (let i = aiMessages.length - 1; i >= 0; i--) {
      if (aiMessages[i].role === 'user') {
        const current = aiMessages[i]
        if (typeof current.content === 'string') {
          current.content = [
            { type: 'text', text: data.content },
            ...fileParts,
          ] as ModelMessage['content']
        }
        break
      }
    }
  }

  const streams: ReadableStream<StreamEvent>[] = []
  const startTimes = new Map<string, number>()
  const firstTokenAts = new Map<string, number>()

  for (let i = 0; i < data.modelIds.length; i++) {
    const genId = genIds[i]
    const modelId = data.modelIds[i]
    const routerId = routerModelIds[i]
    const assistantMsg = assistantMessages[i]
    const abortController = new AbortController()
    controllers.set(genId, abortController)
    startTimes.set(genId, Date.now())

    const stream = new ReadableStream<StreamEvent>({
      async start(controller) {
        controller.enqueue({
          generationId: genId,
          modelId,
          type: 'generation-start',
          timestamp: Date.now(),
        } as StreamEvent)

        let accumulatedContent = ''
        let accumulatedReasoning = ''
        let hasError = false
        let finishReason = 'stop'
        const eventTypes = new Set<string>(['generation-start'])

        try {
          const result = streamText({
            model: nineRouter(routerId),
            system: systemPrompt,
            messages: aiMessages,
            abortSignal: abortController.signal,
            onChunk: () => {
              if (!firstTokenAts.has(genId))
                firstTokenAts.set(genId, Date.now())
            },
            onFinish: async ({
              text,
              usage,
              reasoningText,
              finishReason: fr,
            }) => {
              if (fr) finishReason = fr
              const latencyMs =
                Date.now() - (startTimes.get(genId) ?? Date.now())
              const ttft = firstTokenAts.has(genId)
                ? (firstTokenAts.get(genId) ?? 0) - (startTimes.get(genId) ?? 0)
                : null
              const finalText = text || accumulatedContent
              const finalReasoning =
                reasoningText || accumulatedReasoning || null
              const hasFinalAnswer = Boolean(
                finalText && finalText.trim().length > 0,
              )

              console.info(
                `[STREAM_METRICS_SERVER] modelId=${modelId} genId=${genId} hasFinalAnswer=${hasFinalAnswer} contentLength=${finalText.length} reasoningLength=${finalReasoning?.length ?? 0} finishReason=${finishReason}`,
              )

              try {
                const u = usage as UsageLike
                if (hasFinalAnswer) {
                  await db
                    .update(generationRuns)
                    .set({
                      content: finalText,
                      reasoningContent: finalReasoning,
                      promptTokens: u?.inputTokens ?? u?.promptTokens ?? null,
                      completionTokens:
                        u?.outputTokens ?? u?.completionTokens ?? null,
                      totalTokens: u?.totalTokens ?? null,
                      latencyMs,
                      timeToFirstTokenMs: ttft,
                      status: 'completed',
                      completedAt: new Date(),
                    })
                    .where(eq(generationRuns.id, genId))
                  await db
                    .update(messages)
                    .set({ content: finalText })
                    .where(eq(messages.id, assistantMsg.id))
                  if (usage) {
                    await db.insert(usageRecords).values({
                      userId,
                      generationRunId: genId,
                      modelId,
                      promptTokens: u.inputTokens ?? u.promptTokens ?? 0,
                      completionTokens:
                        u.outputTokens ?? u.completionTokens ?? 0,
                      totalTokens: u.totalTokens ?? 0,
                    })
                  }
                } else {
                  // Guard: Model completed without generating final answer text
                  hasError = true
                  await db
                    .update(generationRuns)
                    .set({
                      content: '',
                      reasoningContent: finalReasoning,
                      status: 'failed',
                      error: {
                        message:
                          'Model tidak menghasilkan jawaban akhir. Coba lagi.',
                        code: 'ERR-001',
                      },
                      latencyMs,
                      timeToFirstTokenMs: ttft,
                      completedAt: new Date(),
                    })
                    .where(eq(generationRuns.id, genId))
                  await refundCredits({
                    userId,
                    generationRunId: genId,
                    modelId,
                    amount: costs[i],
                  })
                }
              } catch (e) {
                console.error('onFinish compare failed', e)
              } finally {
                controllers.delete(genId)
              }
            },
            onError: async ({ error }) => {
              hasError = true
              try {
                const won = await finalizeTerminalRun({
                  genId,
                  status: 'failed',
                  error: { message: (error as Error).message },
                })
                if (!won) {
                  controllers.delete(genId)
                  return
                }
                await db
                  .update(generationRuns)
                  .set({ reasoningContent: accumulatedReasoning || null })
                  .where(eq(generationRuns.id, genId))
                await refundCredits({
                  userId,
                  generationRunId: genId,
                  modelId,
                  amount: costs[i],
                })
              } catch {}
              controllers.delete(genId)
            },
          })

          // Consume stream to trigger onChunk/onFinish; produce reasoning-delta and text-delta events
          const anyResult = result as {
            toUIMessageStreamResponse?: (opts?: unknown) => Response
            toTextStreamResponse?: () => Response
            stream?: ReadableStream
            textStream?: ReadableStream<string>
            fullStream?: ReadableStream<unknown>
          }

          if (anyResult.fullStream) {
            const effReader = anyResult.fullStream.getReader()
            try {
              while (true) {
                const { done, value } = await effReader.read()
                if (done) break
                if (value && typeof value === 'object') {
                  const v = value as Record<string, unknown>
                  if (v.type === 'reasoning' || v.type === 'reasoning-delta') {
                    const rText =
                      (v.textDelta as string) ?? (v.text as string) ?? ''
                    if (rText) {
                      accumulatedReasoning += rText
                      eventTypes.add('reasoning-delta')
                      controller.enqueue({
                        generationId: genId,
                        modelId,
                        type: 'reasoning-delta',
                        text: rText,
                      } as StreamEvent)
                    }
                  } else if (v.type === 'text-delta') {
                    const tText =
                      (v.textDelta as string) ?? (v.text as string) ?? ''
                    if (tText) {
                      accumulatedContent += tText
                      eventTypes.add('text-delta')
                      controller.enqueue({
                        generationId: genId,
                        modelId,
                        type: 'text-delta',
                        text: tText,
                      } as StreamEvent)
                    }
                  } else if (v.type === 'finish') {
                    if (typeof v.finishReason === 'string') {
                      finishReason = v.finishReason
                    }
                  } else if (v.type === 'error') {
                    hasError = true
                  }
                }
              }
            } finally {
              try {
                effReader.releaseLock()
              } catch {}
            }
          } else {
            let effectiveStream: ReadableStream<
              string | Record<string, unknown>
            > | null = null
            if (typeof anyResult.textStream !== 'undefined') {
              effectiveStream = anyResult.textStream as ReadableStream<
                string | Record<string, unknown>
              >
            } else if (anyResult.stream) {
              effectiveStream = anyResult.stream as ReadableStream<
                string | Record<string, unknown>
              >
            }
            if (effectiveStream) {
              const effReader = effectiveStream.getReader()
              try {
                while (true) {
                  const { done, value } = await effReader.read()
                  if (done) break
                  let deltaText: string | null = null
                  if (typeof value === 'string') deltaText = value
                  else if (value && typeof value === 'object') {
                    const v = value as Record<string, unknown>
                    if (typeof v.textDelta === 'string')
                      deltaText = v.textDelta as string
                    else if (typeof v.delta === 'string')
                      deltaText = v.delta as string
                    else if (typeof v.content === 'string')
                      deltaText = v.content as string
                  }
                  if (deltaText !== null) {
                    accumulatedContent += deltaText
                    eventTypes.add('text-delta')
                    controller.enqueue({
                      generationId: genId,
                      modelId,
                      type: 'text-delta',
                      text: deltaText,
                    } as StreamEvent)
                  }
                }
              } finally {
                try {
                  effReader.releaseLock()
                } catch {}
              }
            }
          }

          console.info(
            `[STREAM_METRICS] modelId=${modelId} genId=${genId} eventTypes=${Array.from(eventTypes).join(',')} receivedReasoning=${accumulatedReasoning.length > 0} receivedTextDelta=${accumulatedContent.length > 0} finishReason=${finishReason} hasError=${hasError} contentLength=${accumulatedContent.length}`,
          )

          const hasValidFinalAnswer = Boolean(
            accumulatedContent && accumulatedContent.trim().length > 0,
          )

          if (!hasValidFinalAnswer || hasError) {
            controller.enqueue({
              generationId: genId,
              modelId,
              type: 'generation-error',
              error: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
              code: 'ERR-001',
            } as StreamEvent)
          } else {
            controller.enqueue({
              generationId: genId,
              modelId,
              type: 'generation-finish',
              finishReason: (finishReason as 'stop') || 'stop',
            } as StreamEvent)
          }
          controller.close()
        } catch (err) {
          const msg = (err as Error).message
          // If abort, mark cancelled else failed
          const isAbort =
            (err as Error).name === 'AbortError' ||
            abortController.signal.aborted
          if (isAbort) {
            try {
              await db
                .update(generationRuns)
                .set({
                  status: 'cancelled',
                  reasoningContent: accumulatedReasoning || null,
                  completedAt: new Date(),
                })
                .where(eq(generationRuns.id, genId))
            } catch {}
          } else {
            try {
              await db
                .update(generationRuns)
                .set({
                  status: 'failed',
                  reasoningContent: accumulatedReasoning || null,
                  error: { message: msg },
                  completedAt: new Date(),
                })
                .where(eq(generationRuns.id, genId))
              await refundCredits({
                userId,
                generationRunId: genId,
                modelId,
                amount: costs[i],
              })
            } catch {}
            controller.enqueue({
              generationId: genId,
              modelId,
              type: 'generation-error',
              error: msg,
              code: 'ERR-001',
            } as StreamEvent)
          }
          controller.close()
          controllers.delete(genId)
        }
      },
    })
    streams.push(stream)
  }

  const multiplexed = createMultiplexStream(streams)

  void settleComparisonRunBarrier(compRun.id, genIds).catch(() => {})

  const sseStream = new ReadableStream({
    async start(controller) {
      const reader = multiplexed.getReader()
      const encoder = new TextEncoder()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          const line = `data: ${JSON.stringify(value)}\n\n`
          controller.enqueue(encoder.encode(line))
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Comparison-Id': compRun.id,
      'X-Conversation-Id': convId,
      ...(webSearchFailedCompare
        ? { 'X-Web-Search-Status': 'unavailable' }
        : {}),
    },
  })
}

export async function getComparisonRunsCore({
  conversationId,
  request,
}: {
  conversationId: string
  request: Request
}) {
  const session = await getAuthSession(request)
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
  if (!conv) throw new AppError('Not Found', 404, 'ERR-003')
  if (conv.userId !== session.user.id)
    throw new AppError('Forbidden', 403, 'ERR-003')
  const runs = await db
    .select()
    .from(comparisonRuns)
    .where(eq(comparisonRuns.conversationId, conversationId))
    .orderBy(comparisonRuns.createdAt)
  const gens = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.conversationId, conversationId))
  const gensByComp = new Map<string, typeof gens>()
  for (const g of gens) {
    if (!g.comparisonRunId) continue
    const arr = gensByComp.get(g.comparisonRunId) ?? []
    arr.push(g)
    gensByComp.set(g.comparisonRunId, arr)
  }
  return runs.map((r) => ({ ...r, generations: gensByComp.get(r.id) ?? [] }))
}

export async function retryGenerationCore({
  generationId,
  request,
}: {
  generationId: string
  request: Request
}) {
  const session = await getAuthSession(request)
  const [gen] = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.id, generationId))
  if (!gen) throw new AppError('Not Found', 404, 'ERR-003')
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, gen.conversationId))
  if (!conv || conv.userId !== session.user.id)
    throw new AppError('Forbidden', 403, 'ERR-003')
  if (gen.status !== 'failed')
    throw new AppError('Only failed generations can be retried', 400, 'ERR-003')
  if (isArtifactSkill(gen.skillId ?? 'none')) {
    return retryArtifactGenerationCore({ generationId, request })
  }
  const modelEntry = getModelById(gen.modelId)
  const cost =
    typeof modelEntry.creditCost === 'number'
      ? modelEntry.creditCost
      : modelEntry.creditCost.max
  const creditRes = await db.execute(
    sql`SELECT credits FROM users WHERE id=${session.user.id}`,
  )
  const rows = getRows<{ credits: number }>(creditRes)
  const cur = rows[0]?.credits ?? 0
  if (cur < cost) throwZonaError('ERR-019')

  const [msg] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, gen.messageId))
  if (!msg) throw Object.assign(new Error('Message not found'), { status: 404 })

  const newGenId = crypto.randomUUID()
  const [newMsg] = await db
    .insert(messages)
    .values({
      conversationId: gen.conversationId,
      role: 'assistant',
      content: '',
    })
    .returning()
  await db.insert(generationRuns).values({
    id: newGenId,
    messageId: newMsg.id,
    comparisonRunId: gen.comparisonRunId,
    conversationId: gen.conversationId,
    modelId: gen.modelId,
    routerModelId: gen.routerModelId,
    skillId: gen.skillId,
    status: 'streaming',
    startedAt: new Date(),
  })
  await deductCredits({
    userId: session.user.id,
    generationRunId: newGenId,
    modelId: gen.modelId,
    amount: cost,
  })

  // For simplicity, reuse sendCompare single logic with streamText
  const aiMessages: ModelMessage[] = await buildModelHistory(gen.conversationId)
  const abortController = new AbortController()
  controllers.set(newGenId, abortController)
  const startTime = Date.now()
  let firstTokenAt: number | null = null
  const result = streamText({
    model: nineRouter(gen.routerModelId),
    system: buildSystemPrompt({ skillId: gen.skillId ?? 'none' }),
    messages: aiMessages,
    abortSignal: abortController.signal,
    onChunk: () => {
      if (firstTokenAt === null) firstTokenAt = Date.now()
    },
    onFinish: async ({ text, usage, reasoningText }) => {
      const latencyMs = Date.now() - startTime
      const ttft = firstTokenAt ? firstTokenAt - startTime : null
      const hasFinalAnswer = Boolean(text && text.trim().length > 0)
      const u = usage as UsageLike
      if (hasFinalAnswer) {
        await db
          .update(generationRuns)
          .set({
            content: text,
            reasoningContent: reasoningText ?? null,
            promptTokens: u?.inputTokens ?? null,
            completionTokens: u?.outputTokens ?? null,
            totalTokens: u?.totalTokens ?? null,
            latencyMs,
            timeToFirstTokenMs: ttft,
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(generationRuns.id, newGenId))
        await db
          .update(messages)
          .set({ content: text })
          .where(eq(messages.id, newMsg.id))
        if (usage) {
          await db.insert(usageRecords).values({
            userId: session.user.id,
            generationRunId: newGenId,
            modelId: gen.modelId,
            promptTokens: u.inputTokens ?? 0,
            completionTokens: u.outputTokens ?? 0,
            totalTokens: u.totalTokens ?? 0,
          })
        }
      } else {
        await db
          .update(generationRuns)
          .set({
            content: '',
            reasoningContent: reasoningText ?? null,
            status: 'failed',
            error: {
              message: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
              code: 'ERR-001',
            },
            latencyMs,
            timeToFirstTokenMs: ttft,
            completedAt: new Date(),
          })
          .where(eq(generationRuns.id, newGenId))
        try {
          await refundCredits({
            userId: session.user.id,
            generationRunId: newGenId,
            modelId: gen.modelId,
            amount: cost,
          })
        } catch {}
      }
      controllers.delete(newGenId)
    },
    onError: async ({ error }) => {
      await db
        .update(generationRuns)
        .set({
          status: 'failed',
          error: { message: (error as Error).message },
          completedAt: new Date(),
        })
        .where(eq(generationRuns.id, newGenId))
      try {
        await refundCredits({
          userId: session.user.id,
          generationRunId: newGenId,
          modelId: gen.modelId,
          amount: cost,
        })
      } catch {}
      controllers.delete(newGenId)
    },
  })
  // cast boundary: AI SDK StreamTextResult version variance
  const anyResult = result as {
    toUIMessageStreamResponse?: (opts?: unknown) => Response
    toTextStreamResponse?: () => Response
    stream?: ReadableStream
    textStream?: ReadableStream<string>
  }
  let response: Response
  if (typeof anyResult.toUIMessageStreamResponse === 'function') {
    response = (
      anyResult.toUIMessageStreamResponse as (o?: unknown) => Response
    ).call(result, {
      headers: {
        'X-Generation-Id': newGenId,
        'X-Conversation-Id': gen.conversationId,
      },
    })
  } else {
    response = createTextStreamResponse({
      stream: toTextStream({
        stream: (result as { stream: ReadableStream }).stream,
      }),
      headers: { 'X-Generation-Id': newGenId },
    })
  }
  return response
}

export async function stopGenerationCore({
  generationId,
  request,
}: {
  generationId: string
  request: Request
}) {
  const session = await getAuthSession(request)
  const [gen] = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.id, generationId))
  if (!gen) throw new AppError('Not Found', 404, 'ERR-003')
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, gen.conversationId))
  if (!conv || conv.userId !== session.user.id)
    throw new AppError('Forbidden', 403, 'ERR-003')
  const ctrl = controllers.get(generationId)
  if (ctrl) ctrl.abort()
  const usageRows = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.generationRunId, generationId))
  const usageRow = usageRows.find((row) => row.type === 'usage')
  let cancelRefund: number
  if (usageRow) {
    cancelRefund = Math.abs(usageRow.amount)
  } else {
    const modelEntry = getModelById(gen.modelId)
    cancelRefund =
      typeof modelEntry.creditCost === 'number'
        ? modelEntry.creditCost
        : modelEntry.creditCost.max
  }
  const won = await finalizeTerminalRun({
    genId: generationId,
    status: 'cancelled',
  })
  if (won) {
    await refundCredits({
      userId: session.user.id,
      generationRunId: generationId,
      modelId: gen.modelId,
      amount: cancelRefund,
    })
  }
  controllers.delete(generationId)
  return { ok: true as const }
}
