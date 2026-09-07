import type { ModelMessage } from 'ai'
import { streamText } from 'ai'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { nineRouter } from '../../lib/ai/9router'
import {
  type ArtifactStreamEvent,
  encodeArtifactSseEvent,
  parseArtifactStreamEvent,
} from '../../lib/ai/artifact-stream'
import {
  refundCredits,
  reserveGenerationBatchCredits,
} from '../../lib/ai/credits'
import type { ArtifactKind } from '../../lib/artifacts/contracts'
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
import type { ArtifactOperation } from '../../lib/utils/validation'
import { finalizeArtifactVersion } from './artifact-finalization'
import { planArtifactOperations } from './artifact-operations'
import type { ArtifactProfile } from './artifact-profiles'
import {
  getOwnedArtifact,
  getOwnedArtifactVersion,
} from './artifact-repository'
import { readArtifactVersionContentCore } from './artifact-workspace'
import { autoTitleConversation, controllers } from './chat'
import { buildModelHistory } from './history'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-generation.ts is server-only')
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

export type ArtifactLifecyclePhase =
  | 'accepted'
  | 'first-delta'
  | 'validation'
  | 'saving'
  | 'terminal'

export type ArtifactLifecycleEvent = {
  generationId: string
  conversationId?: string
  messageId?: string
  artifactId?: string
  versionId?: string
  operation: 'create' | 'revise' | 'fork'
  kind: ArtifactKind
  phase: ArtifactLifecyclePhase
  byteSize?: number
  version?: number
  status?: 'completed' | 'failed' | 'cancelled' | 'streaming'
  code?: string
  latencyMs?: number
  timeToFirstTokenMs?: number | null
  finalizationDurationMs?: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  mentionCount?: number
  revisionCount?: number
  contextCount?: number
  fanOut?: number
}

export function logArtifactLifecycle(event: ArtifactLifecycleEvent): void {
  console.info(`[ARTIFACT_LIFECYCLE] ${JSON.stringify(event)}`)
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

export type ArtifactWorkerInput = {
  profile: ArtifactProfile
  operation: 'create' | 'revise'
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
  artifactId?: string
  sourceArtifactId?: string
  sourceVersionId?: string
  expectedCurrentVersionId?: string
  fanOut?: number
  revisionCount?: number
  contextCount?: number
  mentionCount?: number
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

export async function executeArtifactGeneration(
  input: ArtifactWorkerInput,
): Promise<Response> {
  const {
    profile,
    operation,
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
  } = input

  const abortController = new AbortController()
  controllers.set(genId, abortController)

  const encoder = new TextEncoder()

  logArtifactLifecycle({
    generationId: genId,
    conversationId: convId,
    messageId: assistantMsgId,
    operation,
    kind: profile.kind,
    phase: 'accepted',
    status: 'streaming',
    fanOut: input.fanOut,
    revisionCount: input.revisionCount,
    contextCount: input.contextCount,
    mentionCount: input.mentionCount,
  })

  const sseStream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: ArtifactStreamEvent) => {
        try {
          const parsed = parseArtifactStreamEvent(event)
          controller.enqueue(encoder.encode(encodeArtifactSseEvent(parsed)))
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
          logArtifactLifecycle({
            generationId: genId,
            conversationId: convId,
            messageId: assistantMsgId,
            operation,
            kind: profile.kind,
            phase: 'terminal',
            status: 'failed',
            code: 'ERR-016',
            byteSize: reason.contentLength,
            latencyMs: Date.now() - startTime,
          })
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
            phase: 'failed',
            message,
          })
          sendEvent({
            type: 'artifact-error',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
            code: 'ERR-016',
            retryable: true,
            message,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
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
        operation,
        phase: 'preparing',
      })

      let firstTokenAt: number | null = null
      let fullText = ''
      let currentSection: string | undefined
      let sentGenerating = false
      let oversize = false
      let firstDeltaLogged = false

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

        const streamSource =
          (
            result as {
              textStream?: ReadableStream<string>
              stream?: ReadableStream
            }
          ).textStream ?? (result as { stream?: ReadableStream }).stream
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
                if (firstTokenAt === null) firstTokenAt = Date.now()
                if (!firstDeltaLogged) {
                  firstDeltaLogged = true
                  logArtifactLifecycle({
                    generationId: genId,
                    conversationId: convId,
                    messageId: assistantMsgId,
                    operation,
                    kind: profile.kind,
                    phase: 'first-delta',
                    status: 'streaming',
                    latencyMs: Date.now() - startTime,
                    timeToFirstTokenMs: firstTokenAt
                      ? firstTokenAt - startTime
                      : null,
                  })
                }
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
                    operation,
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
                    operation,
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

        if (abortController.signal.aborted) {
          await refundOnce({
            userId,
            genId,
            modelId,
            amount: cost,
            status: 'cancelled',
          })
          logArtifactLifecycle({
            generationId: genId,
            conversationId: convId,
            messageId: assistantMsgId,
            operation,
            kind: profile.kind,
            phase: 'terminal',
            status: 'cancelled',
            latencyMs: Date.now() - startTime,
          })
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
            phase: 'cancelled',
            message: profile.cancelledMessage,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
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

        logArtifactLifecycle({
          generationId: genId,
          conversationId: convId,
          messageId: assistantMsgId,
          operation,
          kind: profile.kind,
          phase: 'validation',
          status: 'streaming',
          byteSize: Buffer.byteLength(fullText, 'utf8'),
        })
        sendEvent({
          type: 'artifact-status',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation,
          phase: 'validating',
        })

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

        logArtifactLifecycle({
          generationId: genId,
          conversationId: convId,
          messageId: assistantMsgId,
          operation,
          kind: profile.kind,
          phase: 'saving',
          status: 'streaming',
          byteSize: built.fileSize,
          latencyMs,
          timeToFirstTokenMs: ttft,
          inputTokens: usageData?.inputTokens ?? usageData?.promptTokens,
          outputTokens: usageData?.outputTokens ?? usageData?.completionTokens,
          totalTokens: usageData?.totalTokens,
        })
        sendEvent({
          type: 'artifact-status',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation,
          phase: 'saving',
        })

        const finalizeStart = Date.now()
        let descriptor: Awaited<ReturnType<typeof finalizeArtifactVersion>>
        try {
          const baseFinalize = {
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
          } as const
          descriptor =
            operation === 'revise'
              ? await finalizeArtifactVersion({
                  ...baseFinalize,
                  finalizationMode: 'revise',
                  artifactId: input.artifactId as string,
                  sourceArtifactId: input.sourceArtifactId as string,
                  sourceVersionId: input.sourceVersionId as string,
                  expectedCurrentVersionId:
                    input.expectedCurrentVersionId as string,
                })
              : await finalizeArtifactVersion({
                  ...baseFinalize,
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
          logArtifactLifecycle({
            generationId: genId,
            conversationId: convId,
            messageId: assistantMsgId,
            operation,
            kind: profile.kind,
            phase: 'terminal',
            status: 'failed',
            code: 'ERR-010',
            latencyMs: Date.now() - startTime,
            finalizationDurationMs: Date.now() - finalizeStart,
          })
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
            phase: 'failed',
            message: profile.failureMessage,
          })
          sendEvent({
            type: 'artifact-error',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
            code: 'ERR-010',
            retryable: true,
            message: profile.failureMessage,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
            status: 'failed',
            messageId: assistantMsgId,
            conversationId: convId,
          })
          controller.close()
          return
        }
        const finalizationDurationMs = Date.now() - finalizeStart

        sendEvent({
          type: 'artifact-created',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation,
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

        logArtifactLifecycle({
          generationId: genId,
          conversationId: convId,
          messageId: assistantMsgId,
          artifactId: descriptor.artifactId,
          versionId: descriptor.versionId,
          operation,
          kind: profile.kind,
          phase: 'terminal',
          status: 'completed',
          byteSize: descriptor.fileSize,
          version: descriptor.version,
          latencyMs: Date.now() - startTime,
          timeToFirstTokenMs: ttft,
          finalizationDurationMs,
          inputTokens: usageData?.inputTokens ?? usageData?.promptTokens,
          outputTokens: usageData?.outputTokens ?? usageData?.completionTokens,
          totalTokens: usageData?.totalTokens,
          fanOut: input.fanOut,
          revisionCount: input.revisionCount,
        })

        sendEvent({
          type: 'artifact-status',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation,
          phase: 'completed',
        })

        sendEvent({
          type: 'artifact-done',
          generationId: genId,
          modelId,
          kind: profile.kind,
          operation,
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

        logArtifactLifecycle({
          generationId: genId,
          conversationId: convId,
          messageId: assistantMsgId,
          operation,
          kind: profile.kind,
          phase: 'terminal',
          status: isAbort ? 'cancelled' : 'failed',
          code: isAbort ? undefined : 'ERR-016',
          latencyMs: Date.now() - startTime,
        })

        if (isAbort) {
          sendEvent({
            type: 'artifact-status',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
            phase: 'cancelled',
            message: profile.cancelledMessage,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
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
            operation,
            phase: 'failed',
            message: profile.incompleteMessage,
          })
          sendEvent({
            type: 'artifact-error',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
            code: 'ERR-016',
            retryable: true,
            message: profile.incompleteMessage,
          })
          sendEvent({
            type: 'artifact-done',
            generationId: genId,
            modelId,
            kind: profile.kind,
            operation,
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

  const firstProfile = profile
  return new Response(sseStream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Generation-Id': genId,
      'X-Conversation-Id': convId,
      'X-Router-Model-Id': routerModelId,
      'X-Artifact-Kind': firstProfile.kind,
      ...(routingReason ? { 'X-Routing-Reason': routingReason } : {}),
    },
  })
}

export type GenerateArtifactsInput = {
  conversationId?: string
  modelId: string
  content: string
  operation: ArtifactOperation
  attachmentIds?: string[]
  enableWebSearch?: boolean
}

async function multiplexArtifactResponses(
  responses: Response[],
  fallbackConvId: string,
): Promise<Response> {
  const encoder = new TextEncoder()
  const merged = new ReadableStream({
    async start(controller) {
      const forward = async (res: Response) => {
        const text = await res.text()
        for (const frame of text.split('\n\n')) {
          const line = frame.split('\n').find((l) => l.startsWith('data:'))
          if (!line) continue
          const payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            const event = parseArtifactStreamEvent(JSON.parse(payload))
            controller.enqueue(encoder.encode(encodeArtifactSseEvent(event)))
          } catch {}
        }
      }
      await Promise.all(responses.map(forward))
      controller.close()
    },
  })
  const firstGenId =
    responses[0]?.headers.get('X-Generation-Id') ?? crypto.randomUUID()
  const firstKind = responses[0]?.headers.get('X-Artifact-Kind') ?? 'prd'
  const firstRouter = responses[0]?.headers.get('X-Router-Model-Id') ?? ''
  const firstReason = responses[0]?.headers.get('X-Routing-Reason')
  return new Response(merged, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Generation-Id': firstGenId,
      'X-Conversation-Id': fallbackConvId,
      ...(firstRouter ? { 'X-Router-Model-Id': firstRouter } : {}),
      'X-Artifact-Kind': firstKind,
      ...(firstReason ? { 'X-Routing-Reason': firstReason } : {}),
    },
  })
}

export async function generateArtifactsCore({
  data,
  request,
}: {
  data: GenerateArtifactsInput
  request: Request
}): Promise<Response> {
  const session = await getAuthSession(request)
  const userId = session.user.id

  const planned = await planArtifactOperations({
    userId,
    operation: data.operation,
    content: data.content,
  })

  const distinctProfiles = new Map<string, ArtifactProfile>()
  for (const target of planned) {
    distinctProfiles.set(target.profile.rateLimitKey, target.profile)
  }
  for (const profile of distinctProfiles.values()) {
    enforceRateLimit({
      key: `${profile.rateLimitKey}:${userId}`,
      limit: profile.rateLimitPerMinute,
      windowMs: RATE_LIMIT_WINDOW_MS,
    })
  }

  const modelEntry = getModelById(data.modelId)
  const creditRes = await db.execute(
    sql`SELECT credits FROM users WHERE id=${userId}`,
  )
  const creditRows = getRows<{ credits: number }>(creditRes)
  const currentCredits = creditRows[0]?.credits ?? 0

  let routerModelId = modelEntry.routerModelId
  let cost: number
  let routingReason: string | undefined
  if (data.modelId === 'auto') {
    const resolved = resolveAutoModel(data.content, { credits: currentCredits })
    routerModelId = resolved.routerModelId
    cost = resolved.cost
    routingReason = resolved.reason
  } else {
    cost =
      typeof modelEntry.creditCost === 'number'
        ? modelEntry.creditCost
        : modelEntry.creditCost.max
  }

  const revisionCount = planned.filter((p) => p.type === 'revise').length
  const fanOut = planned.length

  type LoadedSource = {
    artifactId: string
    versionId: string
    expectedCurrentVersionId: string
    sourceMarkdown: string
    kind: ArtifactKind
    profile: ArtifactProfile
  }
  const loadedSources: LoadedSource[] = []
  if (revisionCount > 0) {
    if (!data.conversationId) {
      throw new AppError('Conversation required for revision', 400, 'ERR-003')
    }
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, data.conversationId))
    if (!conv || conv.userId !== userId) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    for (const target of planned) {
      if (target.type !== 'revise') continue
      const owned = await getOwnedArtifactVersion({
        userId,
        artifactId: target.artifactId,
        versionId: target.versionId,
      })
      if (owned.conversationId !== data.conversationId) {
        throw new AppError('Forbidden', 403, 'ERR-003')
      }
      const detail = await getOwnedArtifact({
        userId,
        artifactId: target.artifactId,
      })
      if (detail.currentVersionId !== target.versionId) {
        throw new AppError(
          'Artifact changed during generation. Review the latest version and retry.',
          409,
          'ERR-003',
        )
      }
      const { bytes } = await readArtifactVersionContentCore({
        userId,
        artifactId: target.artifactId,
        versionId: target.versionId,
      })
      loadedSources.push({
        artifactId: target.artifactId,
        versionId: target.versionId,
        expectedCurrentVersionId: detail.currentVersionId,
        sourceMarkdown: Buffer.from(bytes).toString('utf8'),
        kind: owned.kind,
        profile: target.profile,
      })
    }
  }

  let createRagSuffix = ''
  const createFileParts: Array<{
    type: 'file'
    data: string
    mediaType: string
  }> = []
  const needsCreateContext = planned.some((p) => p.type === 'create')
  if (needsCreateContext && data.conversationId) {
    try {
      const ragContext = await retrieveContext({
        conversationId: data.conversationId,
        query: data.content,
      })
      if (ragContext.length) {
        const joined = ragContext.map((c, i) => `[${i + 1}] ${c}`).join('\n\n')
        const truncated = joined.length > 4000 ? joined.slice(0, 4000) : joined
        createRagSuffix = `\n\nContext from documents:\n${truncated}`
      }
    } catch (e) {
      console.error('retrieve failed in artifact pipeline', e)
    }
  }

  let createAttachmentIds: string[] | undefined
  if (needsCreateContext && data.attachmentIds?.length) {
    const convForAttach = data.conversationId
    if (!convForAttach) {
      throw new AppError(
        'Conversation required for attachments',
        400,
        'ERR-003',
      )
    }
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
      if (a.conversationId !== convForAttach) {
        throw new AppError('Attachment not in conversation', 400, 'ERR-003')
      }
    }
    const hasImage = atts.some((a) => a.mimeType.startsWith('image/'))
    if (hasImage && !isVisionCapable(data.modelId)) {
      throw new AppError(
        'Model tidak mendukung vision. Pilih model vision-capable.',
        400,
        'ERR-003',
      )
    }
    const { getObject } = await import('../../lib/r2/client')
    for (const a of atts.filter((x) => x.mimeType.startsWith('image/'))) {
      const { body } = await getObject({ bucket: a.r2Bucket, key: a.r2Key })
      createFileParts.push({
        type: 'file',
        data: (body as Buffer).toString('base64'),
        mediaType: a.mimeType,
      })
    }
    createAttachmentIds = data.attachmentIds
  }

  const totalCost = cost * planned.length
  if (currentCredits < totalCost) {
    throwZonaError('ERR-019')
  }

  type PreflightRow = {
    assistantMsgId: string
    genId: string
    targetIndex: number
  }
  const preflight = await db.transaction(async (tx) => {
    let convId = data.conversationId
    let createdNew = false
    if (convId) {
      const rows = await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, convId))
      const conv = rows[0]
      if (!conv || conv.userId !== userId) {
        throw new AppError('Forbidden', 403, 'ERR-003')
      }
      await tx
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(
          and(eq(conversations.id, convId), eq(conversations.userId, userId)),
        )
    } else {
      const inserted = await tx
        .insert(conversations)
        .values({ userId, title: 'New Chat', mode: 'normal' })
        .returning()
      convId = inserted[0].id
      createdNew = true
    }
    const resolvedConvId = convId as string

    const [userMsg] = await tx
      .insert(messages)
      .values({
        conversationId: resolvedConvId,
        role: 'user',
        content: data.content,
      })
      .returning()

    if (createAttachmentIds?.length) {
      for (const id of createAttachmentIds) {
        await tx
          .update(attachments)
          .set({ messageId: userMsg.id })
          .where(eq(attachments.id, id))
      }
    }

    const rows: PreflightRow[] = []
    const reservations: Array<{
      generationRunId: string
      modelId: string
      amount: number
    }> = []
    for (let i = 0; i < planned.length; i++) {
      const target = planned[i]
      const [assistantMsg] = await tx
        .insert(messages)
        .values({
          conversationId: resolvedConvId,
          role: 'assistant',
          content: '',
        })
        .returning()
      const genId = crypto.randomUUID()
      const isRevise = target.type === 'revise'
      const source = isRevise
        ? loadedSources.find(
            (s) =>
              s.artifactId === (target as { artifactId: string }).artifactId,
          )
        : undefined
      await tx.insert(generationRuns).values({
        id: genId,
        messageId: assistantMsg.id,
        requestMessageId: userMsg.id,
        conversationId: resolvedConvId,
        modelId: data.modelId,
        routerModelId,
        skillId: target.profile.skillId,
        status: 'streaming',
        startedAt: new Date(),
        sourceArtifactId: source?.artifactId ?? null,
        sourceVersionId: source?.versionId ?? null,
      })
      reservations.push({
        generationRunId: genId,
        modelId: data.modelId,
        amount: cost,
      })
      rows.push({ assistantMsgId: assistantMsg.id, genId, targetIndex: i })
    }

    await reserveGenerationBatchCredits(tx, { userId, reservations })

    return {
      convId: resolvedConvId,
      userMsgId: userMsg.id,
      rows,
      createdNew,
    }
  })

  const shouldAutoTitle = !data.conversationId || preflight.createdNew
  if (shouldAutoTitle) {
    const firstKind =
      planned[0].type === 'create'
        ? artifactKindForSkill(
            (data.operation as { skillId: string }).skillId ?? 'none',
          )
        : planned[0].kind
    void firstKind
    void autoTitleConversation(preflight.convId, data.content)
  } else {
    const [existing] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, preflight.convId))
    if (!existing?.title || existing.title === 'New Chat') {
      void autoTitleConversation(preflight.convId, data.content)
    }
  }

  const workerInputs: ArtifactWorkerInput[] = []
  for (const row of preflight.rows) {
    const target = planned[row.targetIndex]
    const aiMessages: ModelMessage[] = await buildModelHistory(preflight.convId)
    let systemPrompt: string
    let sourceIds: Pick<
      ArtifactWorkerInput,
      | 'artifactId'
      | 'sourceArtifactId'
      | 'sourceVersionId'
      | 'expectedCurrentVersionId'
    > = {}
    if (target.type === 'revise') {
      const source = loadedSources.find(
        (s) => s.artifactId === target.artifactId,
      )
      if (!source) throw new AppError('Source not loaded', 500, 'ERR-013')
      systemPrompt = target.profile.buildRevisionSystemPrompt({
        instruction: data.content,
        sourceMarkdown: source.sourceMarkdown,
        ragSuffix: '',
      })
      sourceIds = {
        artifactId: source.artifactId,
        sourceArtifactId: source.artifactId,
        sourceVersionId: source.versionId,
        expectedCurrentVersionId: source.expectedCurrentVersionId,
      }
    } else {
      systemPrompt = target.profile.buildSystemPrompt({
        userContent: data.content,
        ragSuffix: createRagSuffix,
      })
      if (createFileParts.length) {
        for (let i = aiMessages.length - 1; i >= 0; i--) {
          if (aiMessages[i].role === 'user') {
            const current = aiMessages[i]
            if (typeof current.content === 'string') {
              current.content = [
                { type: 'text', text: data.content },
                ...createFileParts,
              ] as ModelMessage['content']
            }
            break
          }
        }
      }
    }
    workerInputs.push({
      profile: target.profile,
      operation: target.type,
      userId,
      convId: preflight.convId,
      assistantMsgId: row.assistantMsgId,
      genId: row.genId,
      modelId: data.modelId,
      routerModelId,
      routingReason,
      cost,
      userContent: data.content,
      aiMessages,
      systemPrompt,
      startTime: Date.now(),
      fanOut,
      revisionCount,
      contextCount: 0,
      mentionCount: 0,
      ...sourceIds,
    })
  }

  const responses = await Promise.all(
    workerInputs.map((worker) => executeArtifactGeneration(worker)),
  )
  return multiplexArtifactResponses(responses, preflight.convId)
}
