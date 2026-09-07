import type { ModelMessage } from 'ai'
import { streamText } from 'ai'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { nineRouter } from '../../lib/ai/9router'
import {
  type ArtifactStreamEvent,
  encodeArtifactSseEvent,
} from '../../lib/ai/artifact-stream'
import { deductCredits, refundCredits } from '../../lib/ai/credits'
import { getAuthSession } from '../../lib/auth/session'
import { artifactKindForSkill } from '../../lib/chat/skills'
import { db } from '../../lib/db/index'
import {
  attachments,
  conversations,
  generationRuns,
  messages,
} from '../../lib/db/schema'
import { getModelById, isVisionCapable } from '../../lib/models/registry'
import { resolveAutoModel } from '../../lib/models/router'
import { retrieveContext } from '../../lib/rag/retrieve'
import { enforceRateLimit } from '../../lib/security/rate-limit'
import { RATE_LIMIT_WINDOW_MS } from '../../lib/utils/constants'
import {
  AppError,
  throwZonaError,
  type UsageLike,
} from '../../lib/utils/errors'
import type { ArtifactInput } from '../../lib/utils/validation'
import { finalizeArtifactVersion } from './artifact-finalization'
import { ARTIFACT_PROFILES, type ArtifactProfile } from './artifact-profiles'
import { autoTitleConversation, controllers } from './chat'
import { buildModelHistory } from './history'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifacts.ts is server-only')
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

export async function runFinalizeWithCompensation({
  writeR2,
  commitDb,
  deleteR2,
}: {
  writeR2: () => Promise<void>
  commitDb: () => Promise<void>
  deleteR2: () => Promise<void>
}): Promise<void> {
  await writeR2()
  try {
    await commitDb()
  } catch (dbError) {
    try {
      await deleteR2()
    } catch (cleanupError) {
      console.error('Artifact R2 compensation failed', cleanupError)
    }
    throw dbError
  }
}

export async function finalizeTerminalRun({
  genId,
  status,
  error,
}: {
  genId: string
  status: 'completed' | 'failed' | 'cancelled'
  error?: { message: string; code?: string }
}): Promise<boolean> {
  const rows = await db
    .update(generationRuns)
    .set({ status, error, completedAt: new Date() })
    .where(
      and(eq(generationRuns.id, genId), eq(generationRuns.status, 'streaming')),
    )
    .returning({ id: generationRuns.id })
  return rows.length === 1
}

async function refundOnce({
  userId,
  genId,
  modelId,
  amount,
  status,
}: {
  userId: string
  genId: string
  modelId: string
  amount: number
  status: 'failed' | 'cancelled'
}): Promise<void> {
  const won = await finalizeTerminalRun({ genId, status })
  if (!won) return
  await refundCredits({ userId, generationRunId: genId, modelId, amount })
}

type ArtifactStreamContext = {
  profile: ArtifactProfile
  userId: string
  convId: string
  assistantMsgId: string
  genId: string
  modelId: string
  routerModelId: string
  routingReason?: string
  cost: number
  userContent: string
  aiMessages: ModelMessage[]
  systemPrompt: string
  startTime: number
}

// cast boundary: AI SDK StreamTextResult version variance — finishReason is a
// promise on current SDK shapes; resolve defensively without failing the run.
async function readFinishReason(result: unknown): Promise<string | null> {
  const shaped = result as { finishReason?: Promise<unknown> }
  if (!shaped?.finishReason) return null
  try {
    const value = await shaped.finishReason
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}

async function executeArtifactStream(
  ctx: ArtifactStreamContext,
): Promise<Response> {
  const {
    profile,
    userId,
    convId,
    assistantMsgId,
    genId,
    modelId,
    routerModelId,
    routingReason,
    cost,
    userContent,
    aiMessages,
    systemPrompt,
    startTime,
  } = ctx

  const abortController = new AbortController()
  controllers.set(genId, abortController)

  const encoder = new TextEncoder()

  const sseStream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: ArtifactStreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeArtifactSseEvent(event)))
        } catch {}
      }

      const failInvalid = (reason: {
        phase: 'validation' | 'incomplete' | 'oversize'
        issues?: string[]
        contentLength: number
        finishReason?: string | null
      }) => {
        console.warn(
          `[ARTIFACT_DIAG] stage=${reason.phase} kind=${profile.kind} modelId=${modelId} routerModelId=${routerModelId} genId=${genId} finishReason=${reason.finishReason ?? 'n/a'} contentLength=${reason.contentLength}${reason.issues ? ` issues=${reason.issues.join(',')}` : ''}`,
        )
        return (async () => {
          const message =
            reason.phase === 'validation'
              ? profile.validationErrorMessage
              : profile.incompleteMessage
          const won = await finalizeTerminalRun({
            genId,
            status: 'failed',
            error: { message, code: 'ERR-016' },
          })
          if (won) {
            await refundCredits({
              userId,
              generationRunId: genId,
              modelId,
              amount: cost,
            })
          }
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            phase: 'failed',
            message,
          })
          sendEvent({
            type: 'artifact-error',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            code: 'ERR-016',
            retryable: true,
            message,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            status: 'failed',
            messageId: assistantMsgId,
            conversationId: convId,
          })
          controller.close()
        })()
      }

      sendEvent({
        type: 'artifact-status',
        generationId: genId,
        modelId,
        kind: profile.kind,
        operation: 'create',
        phase: 'preparing',
      })

      let firstTokenAt: number | null = null
      let fullText = ''
      let currentSection: string | undefined
      let sentGenerating = false
      let oversize = false

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
                if (Buffer.byteLength(fullText, 'utf8') > profile.maxBytes) {
                  oversize = true
                  break
                }
                const detected = profile.detectSection(fullText)
                if (detected && detected !== currentSection) {
                  currentSection = detected
                  sentGenerating = true
                  sendEvent({
                    type: 'artifact-status',
                    generationId: genId,
                    modelId,
                    kind: profile.kind,
                    operation: 'create',
                    phase: 'generating',
                    section: currentSection,
                  })
                } else if (!sentGenerating && fullText.trim().length > 0) {
                  sentGenerating = true
                  sendEvent({
                    type: 'artifact-status',
                    generationId: genId,
                    modelId,
                    kind: profile.kind,
                    operation: 'create',
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
          await refundOnce({
            userId,
            genId,
            modelId,
            amount: cost,
            status: 'cancelled',
          })
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            phase: 'cancelled',
            message: profile.cancelledMessage,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            status: 'cancelled',
            messageId: assistantMsgId,
            conversationId: convId,
          })
          controller.close()
          return
        }

        const finishReason = await readFinishReason(result)
        console.info(
          `[ARTIFACT_DIAG] stage=stream_end kind=${profile.kind} modelId=${modelId} routerModelId=${routerModelId} genId=${genId} finishReason=${finishReason ?? 'unknown'} contentLength=${fullText.length} byteLength=${Buffer.byteLength(fullText, 'utf8')}`,
        )

        sendEvent({
          type: 'artifact-status',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation: 'create',
          phase: 'validating',
        })

        // Validate generated content before creating file. Oversized or
        // length-truncated output takes the same retryable path; raw provider
        // text is never persisted.
        if (oversize || finishReason === 'length') {
          await failInvalid({
            phase: oversize ? 'oversize' : 'incomplete',
            contentLength: fullText.length,
            finishReason,
          })
          return
        }
        const validation = profile.validate(fullText)
        if (!validation.valid) {
          await failInvalid({
            phase: 'validation',
            issues: validation.issues,
            contentLength: fullText.length,
            finishReason,
          })
          return
        }

        const built = profile.buildArtifact(fullText, userContent)
        if (!built) {
          await failInvalid({
            phase: 'validation',
            contentLength: fullText.length,
            finishReason,
          })
          return
        }

        let usageData: UsageLike | null = null
        try {
          usageData = (await result.usage) as UsageLike
        } catch {}

        const latencyMs = Date.now() - startTime
        const ttft = firstTokenAt ? firstTokenAt - startTime : null

        sendEvent({
          type: 'artifact-status',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation: 'create',
          phase: 'saving',
        })

        let descriptor: Awaited<ReturnType<typeof finalizeArtifactVersion>>
        try {
          descriptor = await finalizeArtifactVersion({
            userId,
            conversationId: convId,
            messageId: assistantMsgId,
            generationId: genId,
            kind: profile.kind,
            title: built.title,
            modelId,
            routerModelId,
            fileName: built.fileName,
            mimeType: profile.mimeType,
            bytes: Buffer.from(built.markdown, 'utf-8'),
            summary: built.summary,
            usage: usageData,
            timing: { latencyMs, timeToFirstTokenMs: ttft },
            finalizationMode: 'create',
          })
        } catch (finalizeErr) {
          console.error(
            `[ARTIFACT_DIAG] stage=finalize_failed kind=${profile.kind} modelId=${modelId} routerModelId=${routerModelId} genId=${genId} errorName=${finalizeErr instanceof Error ? finalizeErr.name : 'unknown'}`,
          )
          console.error('Artifact finalize failed:', finalizeErr)
          const wonFinalize = await finalizeTerminalRun({
            genId,
            status: 'failed',
            error: { message: profile.failureMessage, code: 'ERR-010' },
          })
          if (wonFinalize) {
            await refundCredits({
              userId,
              generationRunId: genId,
              modelId,
              amount: cost,
            })
          }
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            phase: 'failed',
            message: profile.failureMessage,
          })
          sendEvent({
            type: 'artifact-error',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            code: 'ERR-010',
            retryable: true,
            message: profile.failureMessage,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            status: 'failed',
            messageId: assistantMsgId,
            conversationId: convId,
          })
          controller.close()
          return
        }

        // Emit artifact and completion events
        sendEvent({
          type: 'artifact-created',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation: 'create',
          artifactId: descriptor.artifactId,
          versionId: descriptor.versionId,
          title: descriptor.title,
          version: descriptor.version,
          messageId: assistantMsgId,
          conversationId: convId,
          routerModelId,
          summary: built.summary,
          artifact: {
            attachmentId: descriptor.attachmentId,
            fileName: descriptor.fileName,
            fileSize: descriptor.fileSize,
            mimeType: descriptor.mimeType,
          },
        })

        sendEvent({
          type: 'artifact-status',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation: 'create',
          phase: 'completed',
        })

        sendEvent({
          type: 'artifact-done',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation: 'create',
          status: 'completed',
          messageId: assistantMsgId,
          conversationId: convId,
        })
      } catch (err) {
        const isAbort =
          (err as Error).name === 'AbortError' || abortController.signal.aborted
        if (!isAbort) {
          console.error(
            `[ARTIFACT_DIAG] stage=stream_error kind=${profile.kind} modelId=${modelId} routerModelId=${routerModelId} genId=${genId} errorName=${err instanceof Error ? err.name : 'unknown'} errorMessage=${err instanceof Error ? err.message.slice(0, 200) : 'unknown'}`,
          )
        }
        try {
          if (isAbort) {
            await refundOnce({
              userId,
              genId,
              modelId,
              amount: cost,
              status: 'cancelled',
            })
          } else {
            const won = await finalizeTerminalRun({
              genId,
              status: 'failed',
              error: { message: profile.failureMessage, code: 'ERR-016' },
            })
            if (won) {
              await refundCredits({
                userId,
                generationRunId: genId,
                modelId,
                amount: cost,
              })
            }
          }
        } catch (dbErr) {
          console.error('Error during artifact failure cleanup:', dbErr)
        }

        if (isAbort) {
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            phase: 'cancelled',
            message: profile.cancelledMessage,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            status: 'cancelled',
            messageId: assistantMsgId,
            conversationId: convId,
          })
        } else {
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            phase: 'failed',
            message: profile.incompleteMessage,
          })
          sendEvent({
            type: 'artifact-error',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            code: 'ERR-016',
            retryable: true,
            message: profile.incompleteMessage,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation: 'create',
            status: 'failed',
            messageId: assistantMsgId,
            conversationId: convId,
          })
        }
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
      'X-Artifact-Kind': profile.kind,
      ...(routingReason ? { 'X-Routing-Reason': routingReason } : {}),
    },
  })
}

export async function generateArtifactCore({
  data,
  request,
}: {
  data: ArtifactInput
  request: Request
}): Promise<Response> {
  const kind = artifactKindForSkill(data.skillId)
  if (!kind) {
    throw new AppError('Skill artifact tidak didukung.', 400, 'ERR-003')
  }
  const profile = ARTIFACT_PROFILES[kind]

  const session = await getAuthSession(request)
  const userId = session.user.id

  enforceRateLimit({
    key: `${profile.rateLimitKey}:${userId}`,
    limit: profile.rateLimitPerMinute,
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
  const startTime = Date.now()

  await db.insert(generationRuns).values({
    id: genId,
    messageId: assistantMsg.id,
    conversationId: convId,
    modelId: input.modelId,
    routerModelId,
    skillId: profile.skillId,
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
      console.error('retrieve failed in artifact pipeline', e)
    }
  }

  const systemPrompt = profile.buildSystemPrompt({
    userContent: input.content,
    ragSuffix,
  })

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

  return executeArtifactStream({
    profile,
    userId,
    convId,
    assistantMsgId: assistantMsg.id,
    genId,
    modelId: input.modelId,
    routerModelId,
    routingReason,
    cost,
    userContent: input.content,
    aiMessages,
    systemPrompt,
    startTime,
  })
}

export async function retryArtifactGenerationCore({
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
  const kind = artifactKindForSkill(gen.skillId ?? 'none')
  if (!kind)
    throw new AppError('Skill artifact tidak didukung.', 400, 'ERR-003')
  const profile = ARTIFACT_PROFILES[kind]
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

  const recentUser = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, gen.conversationId),
        eq(messages.role, 'user'),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1)
  const userContent = recentUser[0]?.content ?? ''

  const aiMessages: ModelMessage[] = await buildModelHistory(gen.conversationId)

  return executeArtifactStream({
    profile,
    userId: session.user.id,
    convId: gen.conversationId,
    assistantMsgId: newMsg.id,
    genId: newGenId,
    modelId: gen.modelId,
    routerModelId: gen.routerModelId,
    cost,
    userContent,
    aiMessages,
    systemPrompt: profile.buildSystemPrompt({ userContent, ragSuffix: '' }),
    startTime: Date.now(),
  })
}
