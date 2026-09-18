import type { ModelMessage } from 'ai'
import { and, desc, eq, sql } from 'drizzle-orm'
import { reserveGenerationBatchCredits } from '../../lib/ai/credits'
import { checkUserNotBanned } from '../../lib/auth/admin-guard'
import { getAuthSession } from '../../lib/auth/session'
import { artifactKindForSkill } from '../../lib/chat/skills'
import { db } from '../../lib/db/index'
import { conversations, generationRuns, messages } from '../../lib/db/schema'
import { getModelById } from '../../lib/models/registry'
import { resolveAutoModel } from '../../lib/models/router'
import { enforceRateLimit } from '../../lib/security/rate-limit'
import {
  RATE_LIMIT_CHAT_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '../../lib/utils/constants'
import { AppError, throwZonaError } from '../../lib/utils/errors'
import type { ArtifactInput } from '../../lib/utils/validation'
import {
  executeArtifactGeneration,
  finalizeTerminalRun,
  generateArtifactsCore,
} from './artifact-generation'
import { ARTIFACT_PROFILES } from './artifact-profiles'
import {
  getOwnedArtifact,
  getOwnedArtifactVersion,
} from './artifact-repository'
import { readArtifactVersionContentCore } from './artifact-workspace'
import { buildModelHistory } from './history'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifacts.ts is server-only')
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

export { finalizeTerminalRun }

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

export async function generateArtifactCore({
  data,
  request,
}: {
  data: ArtifactInput
  request: Request
}): Promise<Response> {
  return generateArtifactsCore({
    data: {
      conversationId: data.conversationId,
      modelId: data.modelId,
      content: data.content,
      operation: { type: 'create', skillId: data.skillId, context: [] },
      attachmentIds: data.attachmentIds,
      enableWebSearch: data.enableWebSearch,
    },
    request,
  })
}

async function loadCreateInstruction(
  conversationId: string,
  requestMessageId: string | null,
): Promise<{ instruction: string; requestId: string | null }> {
  if (requestMessageId) {
    const [requestMsg] = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.id, requestMessageId),
          eq(messages.conversationId, conversationId),
        ),
      )
    if (requestMsg) {
      return { instruction: requestMsg.content, requestId: requestMsg.id }
    }
  }
  const [recentUser] = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.role, 'user'),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1)
  return {
    instruction: recentUser?.content ?? '',
    requestId: recentUser?.id ?? null,
  }
}

export async function retryArtifactGenerationCore({
  generationId,
  request,
}: {
  generationId: string
  request: Request
}) {
  const session = await getAuthSession(request)
  checkUserNotBanned(session.user)
  enforceRateLimit({
    key: `chat:${session.user.id}`,
    limit: RATE_LIMIT_CHAT_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })
  const userId = session.user.id
  const [gen] = await db
    .select()
    .from(generationRuns)
    .where(eq(generationRuns.id, generationId))
  if (!gen) throw new AppError('Not Found', 404, 'ERR-003')
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, gen.conversationId))
  if (!conv || conv.userId !== userId)
    throw new AppError('Forbidden', 403, 'ERR-003')
  if (gen.status !== 'failed')
    throw new AppError('Only failed generations can be retried', 400, 'ERR-003')
  const kind = artifactKindForSkill(gen.skillId ?? 'none')
  if (!kind)
    throw new AppError('Skill artifact tidak didukung.', 400, 'ERR-003')
  const profile = ARTIFACT_PROFILES[kind]

  const { instruction, requestId } = await loadCreateInstruction(
    gen.conversationId,
    gen.requestMessageId,
  )

  const modelEntry = getModelById(gen.modelId)
  const creditRes = await db.execute(
    sql`SELECT credits FROM users WHERE id=${userId}`,
  )
  const rows = getRows<{ credits: number }>(creditRes)
  const cur = rows[0]?.credits ?? 0
  let routerModelId = gen.routerModelId
  let cost: number
  if (gen.modelId === 'auto') {
    const resolved = resolveAutoModel(instruction, { credits: cur })
    routerModelId = resolved.routerModelId
    cost = resolved.cost
  } else {
    cost =
      typeof modelEntry.creditCost === 'number'
        ? modelEntry.creditCost
        : modelEntry.creditCost.max
  }
  if (cur < cost) throwZonaError('ERR-019')

  const isRevision = Boolean(gen.sourceArtifactId && gen.sourceVersionId)
  let revisionSource:
    | {
        artifactId: string
        sourceArtifactId: string
        sourceVersionId: string
        expectedCurrentVersionId: string
        sourceMarkdown: string
      }
    | undefined
  let systemPrompt: string
  if (isRevision) {
    const sourceArtifactId = gen.sourceArtifactId as string
    const sourceVersionId = gen.sourceVersionId as string
    const owned = await getOwnedArtifactVersion({
      userId,
      artifactId: sourceArtifactId,
      versionId: sourceVersionId,
    })
    void owned
    const detail = await getOwnedArtifact({
      userId,
      artifactId: sourceArtifactId,
    })
    if (detail.currentVersionId !== sourceVersionId) {
      throw new AppError(
        'Artifact changed during generation. Review the latest version and retry.',
        409,
        'ERR-003',
      )
    }
    const { bytes } = await readArtifactVersionContentCore({
      userId,
      artifactId: sourceArtifactId,
      versionId: sourceVersionId,
    })
    const sourceMarkdown = Buffer.from(bytes).toString('utf8')
    revisionSource = {
      artifactId: sourceArtifactId,
      sourceArtifactId,
      sourceVersionId,
      expectedCurrentVersionId: detail.currentVersionId,
      sourceMarkdown,
    }
    systemPrompt = profile.buildRevisionSystemPrompt({
      instruction,
      sourceMarkdown,
      ragSuffix: '',
    })
  } else {
    systemPrompt = profile.buildSystemPrompt({
      userContent: instruction,
      ragSuffix: '',
    })
  }

  const aiMessages: ModelMessage[] = await buildModelHistory(gen.conversationId)

  const preflight = await db.transaction(async (tx) => {
    const [newMsg] = await tx
      .insert(messages)
      .values({
        conversationId: gen.conversationId,
        role: 'assistant',
        content: '',
      })
      .returning()
    const newGenId = crypto.randomUUID()
    await tx.insert(generationRuns).values({
      id: newGenId,
      messageId: newMsg.id,
      requestMessageId: requestId,
      comparisonRunId: gen.comparisonRunId,
      conversationId: gen.conversationId,
      modelId: gen.modelId,
      routerModelId,
      skillId: gen.skillId,
      status: 'streaming',
      startedAt: new Date(),
      sourceArtifactId: revisionSource?.sourceArtifactId ?? null,
      sourceVersionId: revisionSource?.sourceVersionId ?? null,
    })
    await reserveGenerationBatchCredits(tx, {
      userId,
      reservations: [
        { generationRunId: newGenId, modelId: gen.modelId, amount: cost },
      ],
    })
    return { newMsgId: newMsg.id, newGenId }
  })

  return executeArtifactGeneration({
    profile,
    operation: isRevision ? 'revise' : 'create',
    userId,
    convId: gen.conversationId,
    assistantMsgId: preflight.newMsgId,
    genId: preflight.newGenId,
    modelId: gen.modelId,
    routerModelId,
    cost,
    userContent: instruction,
    aiMessages,
    systemPrompt,
    startTime: Date.now(),
    fanOut: 1,
    revisionCount: isRevision ? 1 : 0,
    contextCount: 0,
    mentionCount: 0,
    ...(revisionSource
      ? {
          artifactId: revisionSource.artifactId,
          sourceArtifactId: revisionSource.sourceArtifactId,
          sourceVersionId: revisionSource.sourceVersionId,
          expectedCurrentVersionId: revisionSource.expectedCurrentVersionId,
        }
      : {}),
  })
}
