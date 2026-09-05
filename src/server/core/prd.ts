import type { ModelMessage } from 'ai'
import { streamText } from 'ai'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { nineRouter } from '../../lib/ai/9router'
import { deductCredits, refundCredits } from '../../lib/ai/credits'
import {
  detectCurrentSection,
  generatePrdFilename,
  PRD_MIME_TYPE,
  sanitizeFilename,
  validatePrdContent,
} from '../../lib/ai/prd-artifact'
import {
  encodePrdSseEvent,
  type PrdSection,
  type PrdStreamEvent,
} from '../../lib/ai/prd-stream'
import { buildSystemPrompt } from '../../lib/ai/system-prompt'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db/index'
import {
  attachments,
  conversations,
  generationRuns,
  messages,
  usageRecords,
} from '../../lib/db/schema'
import { getModelById, isVisionCapable } from '../../lib/models/registry'
import { resolveAutoModel } from '../../lib/models/router'
import { putObject } from '../../lib/r2/client'
import { retrieveContext } from '../../lib/rag/retrieve'
import { enforceRateLimit } from '../../lib/security/rate-limit'
import {
  RATE_LIMIT_PRD_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '../../lib/utils/constants'
import {
  AppError,
  throwZonaError,
  type UsageLike,
} from '../../lib/utils/errors'
import type { chatSchema } from '../../lib/utils/validation'
import { autoTitleConversation, controllers } from './chat'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/prd.ts is server-only')
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

export async function generatePrdArtifactCore({
  data,
  request,
}: {
  data: z.infer<typeof chatSchema>
  request: Request
}): Promise<Response> {
  const session = await getAuthSession(request)
  const userId = session.user.id

  enforceRateLimit({
    key: `prd:${userId}`,
    limit: RATE_LIMIT_PRD_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })

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
      const { body } = await getObject(a.r2Key)
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
  const startTime = Date.now()

  await db.insert(generationRuns).values({
    id: genId,
    messageId: assistantMsg.id,
    conversationId: convId,
    modelId: input.modelId,
    routerModelId,
    skillId: 'prd-plan',
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

  let ragSuffix = ''
  if (input.attachmentIds?.length) {
    try {
      const ragContext = await retrieveContext({
        conversationId: convId,
        query: input.content,
      })
      if (ragContext.length) {
        const joined = ragContext.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')
        const truncated = joined.length > 4000 ? joined.slice(0, 4000) : joined
        ragSuffix = `\n\nContext from documents:\n${truncated}`
      }
    } catch (e) {
      console.error('retrieve failed in PRD pipeline', e)
    }
  }

  const systemPrompt =
    buildSystemPrompt({ skillId: 'prd-plan', hasWebSources: false }) + ragSuffix

  const abortController = new AbortController()
  controllers.set(genId, abortController)

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
            { type: 'text', text: input.content },
            ...fileParts,
          ] as ModelMessage['content']
        }
        break
      }
    }
  }

  const encoder = new TextEncoder()

  const sseStream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: PrdStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodePrdSseEvent(event)))
        } catch {}
      }

      sendEvent({ type: 'prd-status', phase: 'preparing' })

      let firstTokenAt: number | null = null
      let fullText = ''
      let currentSection: PrdSection | undefined

      try {
        const result = streamText({
          model: nineRouter(routerModelId),
          system: systemPrompt,
          messages: aiMessages,
          abortSignal: abortController.signal,
          onChunk: () => {
            if (firstTokenAt === null) firstTokenAt = Date.now()
          },
        })

        // Consume text stream internally - deltas are accumulated on server, not sent to client
        const anyResult = result as {
          textStream?: ReadableStream<string>
          stream?: ReadableStream
        }
        const streamSource = anyResult.textStream ?? anyResult.stream
        if (streamSource) {
          const reader = streamSource.getReader()
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break
              const chunk =
                typeof value === 'string'
                  ? value
                  : ((value as { textDelta?: string; delta?: string })
                      ?.textDelta ??
                    (value as { textDelta?: string; delta?: string })?.delta ??
                    '')
              if (chunk) {
                fullText += chunk
                const detected = detectCurrentSection(fullText)
                if (detected && detected !== currentSection) {
                  currentSection = detected
                  sendEvent({
                    type: 'prd-status',
                    phase: 'generating',
                    section: currentSection,
                  })
                } else if (!currentSection && fullText.trim().length > 0) {
                  sendEvent({
                    type: 'prd-status',
                    phase: 'generating',
                  })
                }
              }
            }
          } finally {
            try {
              reader.releaseLock()
            } catch {}
          }
        }

        // Check if aborted
        if (abortController.signal.aborted) {
          await db
            .update(generationRuns)
            .set({ status: 'cancelled', completedAt: new Date() })
            .where(eq(generationRuns.id, genId))
          await refundCredits({
            userId,
            generationRunId: genId,
            modelId: input.modelId,
            amount: cost,
          })
          sendEvent({
            type: 'prd-status',
            phase: 'error',
            message: 'Pembuatan PRD dibatalkan.',
          })
          controller.close()
          return
        }

        sendEvent({ type: 'prd-status', phase: 'creating_file' })

        // Validate generated content before creating file
        const validation = validatePrdContent(fullText)
        if (!validation.valid) {
          const issueMsg = validation.issues.join(', ')
          await db
            .update(generationRuns)
            .set({
              status: 'failed',
              content: fullText,
              error: { message: `PRD validation failed: ${issueMsg}` },
              completedAt: new Date(),
            })
            .where(eq(generationRuns.id, genId))

          await refundCredits({
            userId,
            generationRunId: genId,
            modelId: input.modelId,
            amount: cost,
          })

          sendEvent({
            type: 'prd-status',
            phase: 'error',
            message: 'Format PRD tidak valid atau tidak lengkap dari model AI.',
          })
          controller.close()
          return
        }

        // Generate filename and upload to R2
        const rawFileName = generatePrdFilename(input.content)
        const fileName = sanitizeFilename(rawFileName)
        const fileBuffer = Buffer.from(fullText, 'utf-8')
        const attachmentId = crypto.randomUUID()
        const r2Key = `users/${userId}/attachments/${attachmentId}/${fileName}`

        try {
          await putObject({
            key: r2Key,
            body: fileBuffer,
            contentType: PRD_MIME_TYPE,
          })
        } catch (uploadErr) {
          console.error('R2 upload failed in PRD workflow:', uploadErr)
          await db
            .update(generationRuns)
            .set({
              status: 'failed',
              content: fullText,
              error: { message: 'PRD upload to R2 failed' },
              completedAt: new Date(),
            })
            .where(eq(generationRuns.id, genId))

          await refundCredits({
            userId,
            generationRunId: genId,
            modelId: input.modelId,
            amount: cost,
          })

          sendEvent({
            type: 'prd-status',
            phase: 'error',
            message: 'PRD berhasil dibuat, tetapi file gagal disiapkan.',
          })
          controller.close()
          return
        }

        // Insert attachment linked to assistant message
        await db.insert(attachments).values({
          id: attachmentId,
          userId,
          conversationId: convId,
          messageId: assistantMsg.id,
          fileName,
          fileSize: fileBuffer.length,
          mimeType: PRD_MIME_TYPE,
          r2Key,
          r2Bucket: (process.env.R2_BUCKET_NAME as string) || 'zona-ai',
          processingStatus: 'completed',
          extractedText: fullText,
        })

        // Update assistant message with short summary text
        const summaryMessage = 'PRD selesai dibuat.'
        await db
          .update(messages)
          .set({ content: summaryMessage })
          .where(eq(messages.id, assistantMsg.id))

        // Update generation run
        const latencyMs = Date.now() - startTime
        const ttft = firstTokenAt ? firstTokenAt - startTime : null

        let usageData: UsageLike | null = null
        try {
          usageData = (await result.usage) as UsageLike
        } catch {}

        await db
          .update(generationRuns)
          .set({
            content: fullText,
            promptTokens:
              usageData?.inputTokens ?? usageData?.promptTokens ?? null,
            completionTokens:
              usageData?.outputTokens ?? usageData?.completionTokens ?? null,
            totalTokens: usageData?.totalTokens ?? null,
            latencyMs,
            timeToFirstTokenMs: ttft,
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(generationRuns.id, genId))

        if (usageData) {
          await db.insert(usageRecords).values({
            userId,
            generationRunId: genId,
            modelId: input.modelId,
            promptTokens: usageData.inputTokens ?? usageData.promptTokens ?? 0,
            completionTokens:
              usageData.outputTokens ?? usageData.completionTokens ?? 0,
            totalTokens: usageData.totalTokens ?? 0,
          })
        }

        // Emit artifact and completion events
        sendEvent({
          type: 'prd-artifact',
          attachmentId,
          fileName,
          fileSize: fileBuffer.length,
          mimeType: PRD_MIME_TYPE,
        })

        sendEvent({
          type: 'prd-status',
          phase: 'completed',
        })

        sendEvent({
          type: 'prd-done',
          messageId: assistantMsg.id,
          generationId: genId,
          conversationId: convId,
        })
      } catch (err) {
        const isAbort =
          (err as Error).name === 'AbortError' || abortController.signal.aborted
        const errorMsg = isAbort
          ? 'Pembuatan PRD dibatalkan.'
          : (err as Error).message || 'Gagal menghasilkan PRD.'

        try {
          await db
            .update(generationRuns)
            .set({
              status: isAbort ? 'cancelled' : 'failed',
              error: { message: errorMsg },
              completedAt: new Date(),
            })
            .where(eq(generationRuns.id, genId))

          await refundCredits({
            userId,
            generationRunId: genId,
            modelId: input.modelId,
            amount: cost,
          })
        } catch (dbErr) {
          console.error('Error during PRD failure cleanup:', dbErr)
        }

        sendEvent({
          type: 'prd-status',
          phase: 'error',
          message: errorMsg,
        })
      } finally {
        controllers.delete(genId)
        try {
          controller.close()
        } catch {}
      }
    },
  })

  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Generation-Id': genId,
      'X-Conversation-Id': convId,
      'X-Router-Model-Id': routerModelId,
      ...(routingReason ? { 'X-Routing-Reason': routingReason } : {}),
    },
  })
}
