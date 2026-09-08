import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  ARTIFACT_KINDS,
  type ArtifactDescriptor,
  type ArtifactKind,
  artifactDescriptorSchema,
} from '../../lib/artifacts/contracts'
import { type DatabaseTransaction, db } from '../../lib/db/index'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  generationRuns,
  messages,
  usageRecords,
} from '../../lib/db/schema'
import { env } from '../../lib/env.server'
import {
  deleteObject,
  type PutStoredObjectInput,
  putObject,
  type StoredObjectLocator,
} from '../../lib/r2/client'
import {
  ARTIFACT_TITLE_MAX_LENGTH,
  MAX_ARTIFACT_VERSION_BYTES,
} from '../../lib/utils/constants'
import { AppError } from '../../lib/utils/errors'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-finalization.ts is server-only')
}

export const FINALIZATION_MODES = ['create', 'revise', 'fork'] as const

export type FinalizationMode = (typeof FINALIZATION_MODES)[number]

const uuidSchema = z.string().uuid()

const finalizeUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
  promptTokens: z.number().int().nonnegative().optional(),
  completionTokens: z.number().int().nonnegative().optional(),
})

export type FinalizeUsage = z.infer<typeof finalizeUsageSchema>

const finalizeCommonSchema = z.object({
  userId: z.string().min(1),
  conversationId: uuidSchema,
  messageId: uuidSchema,
  generationId: uuidSchema,
  kind: z.enum(ARTIFACT_KINDS),
  title: z.string().trim().min(1).max(ARTIFACT_TITLE_MAX_LENGTH),
  modelId: z.string().min(1),
  routerModelId: z.string().min(1),
  fileName: z.string().trim().min(1).max(120),
  mimeType: z.literal('text/markdown'),
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.length > 0, { message: 'empty-bytes' })
    .refine((bytes) => bytes.length <= MAX_ARTIFACT_VERSION_BYTES, {
      message: 'oversized-bytes',
    }),
  summary: z.string().min(1),
  usage: finalizeUsageSchema.nullable(),
  timing: z.object({
    latencyMs: z.number().int().nonnegative(),
    timeToFirstTokenMs: z.number().int().nonnegative().nullable(),
  }),
})

export const finalizeArtifactVersionInputSchema = z.discriminatedUnion(
  'finalizationMode',
  [
    finalizeCommonSchema.extend({
      finalizationMode: z.literal('create'),
    }),
    finalizeCommonSchema.extend({
      finalizationMode: z.literal('revise'),
      artifactId: uuidSchema,
      sourceArtifactId: uuidSchema,
      sourceVersionId: uuidSchema,
      expectedCurrentVersionId: uuidSchema,
    }),
    finalizeCommonSchema.extend({
      finalizationMode: z.literal('fork'),
      sourceArtifactId: uuidSchema,
      sourceVersionId: uuidSchema,
      expectedCurrentVersionId: uuidSchema,
    }),
  ],
)

export type FinalizeArtifactVersionInput = z.infer<
  typeof finalizeArtifactVersionInputSchema
>

export type FinalizeStorageOverrides = {
  putObject?: (input: PutStoredObjectInput) => Promise<void>
  deleteObject?: (locator: StoredObjectLocator) => Promise<void>
  generateId?: () => string
}

export function computeContentSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function buildArtifactObjectKey({
  userId,
  attachmentId,
  fileName,
}: {
  userId: string
  attachmentId: string
  fileName: string
}): string {
  const leaf =
    fileName.split('/').pop()?.split('\\').pop()?.trim() || 'artifact.md'
  return `users/${userId}/attachments/${attachmentId}/${leaf}`
}

export function buildChangeSummary(
  mode: FinalizationMode,
  version: number,
): string {
  if (mode === 'revise') return `Revised to version ${version}`
  if (mode === 'fork') return 'Forked artifact'
  return 'Created artifact'
}

function staleArtifactError(): AppError {
  return new AppError(
    'Artifact changed during generation. Review the latest version and retry.',
    409,
    'ERR-003',
  )
}

function generationInactiveError(): AppError {
  return new AppError('Generation no longer active', 409, 'ERR-003')
}

type CommitArgs = {
  mode: FinalizationMode
  userId: string
  conversationId: string
  messageId: string
  generationId: string
  kind: ArtifactKind
  title: string
  modelId: string
  routerModelId: string
  fileName: string
  fileSize: number
  mimeType: 'text/markdown'
  summary: string
  usage: FinalizeUsage | null
  latencyMs: number
  timeToFirstTokenMs: number | null
  markdown: string
  contentSha256: string
  attachmentId: string
  artifactId: string
  versionId: string
  r2Key: string
  r2Bucket: string
  sourceArtifactId: string | null
  sourceVersionId: string | null
  expectedCurrentVersionId: string | null
}

type CommitResult =
  | { descriptor: ArtifactDescriptor; status: 'committed' }
  | { status: 'conversation-deleting' }

async function commitFinalizedVersion(
  tx: DatabaseTransaction,
  args: CommitArgs,
): Promise<CommitResult> {
  const [conversation] = await tx
    .select({
      deletionStartedAt: conversations.deletionStartedAt,
      userId: conversations.userId,
    })
    .from(conversations)
    .where(eq(conversations.id, args.conversationId))
    .for('update')
  if (!conversation || conversation.userId !== args.userId) {
    throw new AppError('Forbidden', 403, 'ERR-003')
  }
  if (conversation.deletionStartedAt) {
    await tx
      .update(attachments)
      .set({ processingStatus: 'compensating' })
      .where(
        and(
          eq(attachments.id, args.attachmentId),
          eq(attachments.conversationId, args.conversationId),
          eq(attachments.userId, args.userId),
        ),
      )
    return { status: 'conversation-deleting' }
  }

  const current = await tx
    .select({ status: generationRuns.status })
    .from(generationRuns)
    .where(eq(generationRuns.id, args.generationId))
    .for('update')
  if (current[0]?.status !== 'streaming') throw generationInactiveError()

  let versionNumber: number
  if (args.mode === 'revise') {
    const rows = await tx
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, args.artifactId))
      .for('update')
    const artifact = rows[0]
    if (
      !artifact ||
      artifact.userId !== args.userId ||
      artifact.conversationId !== args.conversationId
    ) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    if (artifact.kind !== args.kind) {
      throw new AppError('Artifact kind mismatch', 400, 'ERR-003')
    }
    if (artifact.currentVersionId !== args.expectedCurrentVersionId) {
      throw staleArtifactError()
    }
    const [pointer] = await tx
      .select({ version: artifactVersions.version })
      .from(artifactVersions)
      .where(eq(artifactVersions.id, artifact.currentVersionId ?? ''))
      .limit(1)
    if (!pointer) throw staleArtifactError()
    versionNumber = pointer.version + 1
  } else {
    if (args.mode === 'fork') {
      const rows = await tx
        .select()
        .from(artifacts)
        .where(eq(artifacts.id, args.sourceArtifactId ?? ''))
        .for('update')
      const source = rows[0]
      if (
        !source ||
        source.userId !== args.userId ||
        source.conversationId !== args.conversationId
      ) {
        throw new AppError('Forbidden', 403, 'ERR-003')
      }
      if (source.currentVersionId !== args.expectedCurrentVersionId) {
        throw staleArtifactError()
      }
    }
    versionNumber = 1
    await tx.insert(artifacts).values({
      id: args.artifactId,
      userId: args.userId,
      conversationId: args.conversationId,
      kind: args.kind,
      title: args.title,
      currentVersionId: null,
    })
  }

  await tx
    .update(attachments)
    .set({ processingStatus: 'completed' })
    .where(
      and(
        eq(attachments.id, args.attachmentId),
        eq(attachments.conversationId, args.conversationId),
        eq(attachments.userId, args.userId),
      ),
    )
  await tx.insert(artifactVersions).values({
    id: args.versionId,
    artifactId: args.artifactId,
    conversationId: args.conversationId,
    version: versionNumber,
    sourceVersionId: args.sourceVersionId,
    attachmentId: args.attachmentId,
    generationRunId: args.generationId,
    title: args.title,
    contentSha256: args.contentSha256,
    createdByModelId: args.modelId,
    createdByRouterModelId: args.routerModelId,
    changeSummary: buildChangeSummary(args.mode, versionNumber),
  })
  if (args.mode === 'revise') {
    await tx
      .update(artifacts)
      .set({
        currentVersionId: args.versionId,
        title: args.title,
        updatedAt: new Date(),
      })
      .where(eq(artifacts.id, args.artifactId))
  } else {
    await tx
      .update(artifacts)
      .set({ currentVersionId: args.versionId })
      .where(eq(artifacts.id, args.artifactId))
  }

  await tx
    .update(messages)
    .set({ content: args.summary })
    .where(
      and(
        eq(messages.id, args.messageId),
        eq(messages.conversationId, args.conversationId),
      ),
    )
  await tx
    .update(generationRuns)
    .set({
      content: args.markdown,
      promptTokens: args.usage?.inputTokens ?? args.usage?.promptTokens ?? null,
      completionTokens:
        args.usage?.outputTokens ?? args.usage?.completionTokens ?? null,
      totalTokens: args.usage?.totalTokens ?? null,
      latencyMs: args.latencyMs,
      timeToFirstTokenMs: args.timeToFirstTokenMs,
      status: 'completed',
      completedAt: new Date(),
      sourceArtifactId: args.sourceArtifactId,
      sourceVersionId: args.sourceVersionId,
    })
    .where(eq(generationRuns.id, args.generationId))
  if (args.usage) {
    await tx.insert(usageRecords).values({
      userId: args.userId,
      generationRunId: args.generationId,
      modelId: args.modelId,
      promptTokens: args.usage.inputTokens ?? args.usage.promptTokens ?? 0,
      completionTokens:
        args.usage.outputTokens ?? args.usage.completionTokens ?? 0,
      totalTokens: args.usage.totalTokens ?? 0,
    })
  }

  return {
    descriptor: artifactDescriptorSchema.parse({
      artifactId: args.artifactId,
      versionId: args.versionId,
      attachmentId: args.attachmentId,
      generationId: args.generationId,
      kind: args.kind,
      title: args.title,
      fileName: args.fileName,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      version: versionNumber,
      modelId: args.modelId,
      routerModelId: args.routerModelId,
    }),
    status: 'committed',
  }
}

async function compensateFinalization({
  attachmentId,
  conversationId,
  locator,
  rejection,
  removeObject,
  userId,
}: {
  attachmentId: string
  conversationId: string
  locator: StoredObjectLocator
  rejection: unknown
  removeObject: (locator: StoredObjectLocator) => Promise<void>
  userId: string
}): Promise<never> {
  await db.transaction(async (tx) => {
    const [conversation] = await tx
      .select({ deletionStartedAt: conversations.deletionStartedAt })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, userId),
        ),
      )
      .for('update')
    if (conversation?.deletionStartedAt) {
      await tx
        .update(conversations)
        .set({
          deletionStartedAt: new Date(
            conversation.deletionStartedAt.getTime() + 1,
          ),
        })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, userId),
          ),
        )
    }
    await tx
      .update(attachments)
      .set({ processingStatus: 'compensating' })
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.conversationId, conversationId),
          eq(attachments.userId, userId),
        ),
      )
  })
  try {
    await removeObject(locator)
  } catch {
    await db
      .update(attachments)
      .set({ processingStatus: 'cleanup_failed' })
      .where(
        and(
          eq(attachments.id, attachmentId),
          eq(attachments.conversationId, conversationId),
          eq(attachments.userId, userId),
        ),
      )
    throw new AppError('Artifact cleanup failed.', 500, 'ERR-013')
  }
  await db
    .delete(attachments)
    .where(
      and(
        eq(attachments.id, attachmentId),
        eq(attachments.conversationId, conversationId),
        eq(attachments.userId, userId),
      ),
    )
  throw rejection
}

export async function finalizeArtifactVersion(
  rawInput: FinalizeArtifactVersionInput,
  overrides: FinalizeStorageOverrides = {},
): Promise<ArtifactDescriptor> {
  const input = finalizeArtifactVersionInputSchema.parse(rawInput)
  const writeObject = overrides.putObject ?? putObject
  const removeObject = overrides.deleteObject ?? deleteObject
  const newId = overrides.generateId ?? (() => crypto.randomUUID())

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, input.conversationId))
    .limit(1)
  if (!conversation || conversation.userId !== input.userId) {
    throw new AppError('Forbidden', 403, 'ERR-003')
  }
  const [message] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.id, input.messageId),
        eq(messages.conversationId, input.conversationId),
      ),
    )
    .limit(1)
  if (!message) throw new AppError('Message not found', 404, 'ERR-003')
  const [generation] = await db
    .select({ id: generationRuns.id })
    .from(generationRuns)
    .where(
      and(
        eq(generationRuns.id, input.generationId),
        eq(generationRuns.conversationId, input.conversationId),
      ),
    )
    .limit(1)
  if (!generation) throw new AppError('Generation not found', 404, 'ERR-003')

  if (input.finalizationMode === 'revise') {
    const [artifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, input.artifactId))
      .limit(1)
    if (
      !artifact ||
      artifact.userId !== input.userId ||
      artifact.conversationId !== input.conversationId
    ) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    if (artifact.kind !== input.kind) {
      throw new AppError('Artifact kind mismatch', 400, 'ERR-003')
    }
    const [source] = await db
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(
        and(
          eq(artifactVersions.id, input.sourceVersionId),
          eq(artifactVersions.artifactId, input.artifactId),
          eq(artifactVersions.conversationId, input.conversationId),
        ),
      )
      .limit(1)
    if (!source)
      throw new AppError('Artifact version not found.', 404, 'ERR-003')
  } else if (input.finalizationMode === 'fork') {
    const [sourceArtifact] = await db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, input.sourceArtifactId))
      .limit(1)
    if (
      !sourceArtifact ||
      sourceArtifact.userId !== input.userId ||
      sourceArtifact.conversationId !== input.conversationId
    ) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    const [source] = await db
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(
        and(
          eq(artifactVersions.id, input.sourceVersionId),
          eq(artifactVersions.artifactId, input.sourceArtifactId),
          eq(artifactVersions.conversationId, input.conversationId),
        ),
      )
      .limit(1)
    if (!source)
      throw new AppError('Artifact version not found.', 404, 'ERR-003')
  }

  const contentSha256 = computeContentSha256(input.bytes)
  const fileSize = input.bytes.length
  const attachmentId = newId()
  const artifactId =
    input.finalizationMode === 'revise' ? input.artifactId : newId()
  const versionId = newId()
  const r2Key = buildArtifactObjectKey({
    userId: input.userId,
    attachmentId,
    fileName: input.fileName,
  })
  const locator: StoredObjectLocator = {
    bucket: env.R2_BUCKET_NAME,
    key: r2Key,
  }
  await db.transaction(async (tx) => {
    const [currentConversation] = await tx
      .select({
        deletionStartedAt: conversations.deletionStartedAt,
        userId: conversations.userId,
      })
      .from(conversations)
      .where(eq(conversations.id, input.conversationId))
      .for('update')
    if (!currentConversation || currentConversation.userId !== input.userId) {
      throw new AppError('Forbidden', 403, 'ERR-003')
    }
    if (currentConversation.deletionStartedAt) {
      throw new AppError('This conversation is being deleted.', 409, 'ERR-003')
    }
    await tx.insert(attachments).values({
      id: attachmentId,
      userId: input.userId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      fileName: input.fileName,
      fileSize,
      mimeType: input.mimeType,
      r2Key,
      r2Bucket: locator.bucket,
      processingStatus: 'writing',
      extractedText: null,
    })
  })

  try {
    await writeObject({
      bucket: locator.bucket,
      key: locator.key,
      body: input.bytes,
      contentType: input.mimeType,
    })
  } catch (error) {
    return compensateFinalization({
      attachmentId,
      conversationId: input.conversationId,
      locator,
      rejection: error,
      removeObject,
      userId: input.userId,
    })
  }

  const markdown = Buffer.from(input.bytes).toString('utf8')
  let result: CommitResult
  try {
    result = await db.transaction((tx) =>
      commitFinalizedVersion(tx, {
        mode: input.finalizationMode,
        userId: input.userId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        generationId: input.generationId,
        kind: input.kind,
        title: input.title,
        modelId: input.modelId,
        routerModelId: input.routerModelId,
        fileName: input.fileName,
        fileSize,
        mimeType: input.mimeType,
        summary: input.summary,
        usage: input.usage,
        latencyMs: input.timing.latencyMs,
        timeToFirstTokenMs: input.timing.timeToFirstTokenMs,
        markdown,
        contentSha256,
        attachmentId,
        artifactId,
        versionId,
        r2Key,
        r2Bucket: locator.bucket,
        sourceArtifactId:
          input.finalizationMode === 'create' ? null : input.sourceArtifactId,
        sourceVersionId:
          input.finalizationMode === 'create' ? null : input.sourceVersionId,
        expectedCurrentVersionId:
          input.finalizationMode === 'create'
            ? null
            : input.expectedCurrentVersionId,
      }),
    )
  } catch (error) {
    return compensateFinalization({
      attachmentId,
      conversationId: input.conversationId,
      locator,
      rejection: error,
      removeObject,
      userId: input.userId,
    })
  }
  if (result.status === 'conversation-deleting') {
    return compensateFinalization({
      attachmentId,
      conversationId: input.conversationId,
      locator,
      rejection: new AppError(
        'This conversation is being deleted.',
        409,
        'ERR-003',
      ),
      removeObject,
      userId: input.userId,
    })
  }
  return result.descriptor
}
