import { and, eq, inArray } from 'drizzle-orm'
import type {
  ArtifactKind,
  StoredObjectLocator,
} from '../../lib/artifacts/contracts'
import type { ArtifactMentionInput } from '../../lib/artifacts/mentions'
import { type DatabaseTransaction, db } from '../../lib/db'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  messageArtifactMentions,
  messages,
} from '../../lib/db/schema'
import { AppError } from '../../lib/utils/errors'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-mentions.ts is server-only')
}

export type ResolvedArtifactMention = {
  artifactId: string
  versionId: string
  mode: 'context' | 'revise'
  title: string
  kind: ArtifactKind
  version: number
  attachmentId: string
  modelId: string
  routerModelId: string
  locator: StoredObjectLocator
  contentSha256: string | null
}

export async function resolveArtifactMentions({
  userId,
  conversationId,
  mentions,
}: {
  userId: string
  conversationId: string
  mentions: readonly ArtifactMentionInput[]
}): Promise<ResolvedArtifactMention[]> {
  if (!mentions.length) return []

  const [conv] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    )

  if (!conv) {
    throw new AppError(
      'Percakapan tidak ditemukan atau tidak diizinkan.',
      404,
      'ERR-003',
    )
  }

  const versionIds = mentions.map((m) => m.versionId)
  const rows = await db
    .select({
      artifactId: artifactVersions.artifactId,
      versionId: artifactVersions.id,
      title: artifactVersions.title,
      version: artifactVersions.version,
      createdByModelId: artifactVersions.createdByModelId,
      createdByRouterModelId: artifactVersions.createdByRouterModelId,
      contentSha256: artifactVersions.contentSha256,
      kind: artifacts.kind,
      currentVersionId: artifacts.currentVersionId,
      attachmentId: attachments.id,
      r2Bucket: attachments.r2Bucket,
      r2Key: attachments.r2Key,
    })
    .from(artifactVersions)
    .innerJoin(
      artifacts,
      and(
        eq(artifacts.id, artifactVersions.artifactId),
        eq(artifacts.conversationId, conversationId),
        eq(artifacts.userId, userId),
      ),
    )
    .innerJoin(
      attachments,
      and(
        eq(attachments.id, artifactVersions.attachmentId),
        eq(attachments.conversationId, conversationId),
        eq(attachments.userId, userId),
      ),
    )
    .where(
      and(
        eq(artifactVersions.conversationId, conversationId),
        inArray(artifactVersions.id, versionIds),
      ),
    )

  const rowMap = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    rowMap.set(`${row.artifactId}:${row.versionId}`, row)
  }

  const resolved: ResolvedArtifactMention[] = []
  for (const mention of mentions) {
    const row = rowMap.get(`${mention.artifactId}:${mention.versionId}`)
    if (!row) {
      throw new AppError(
        'Artifact mention tidak ditemukan atau tidak diizinkan.',
        404,
        'ERR-003',
      )
    }

    if (mention.mode === 'revise') {
      if (row.currentVersionId !== mention.versionId) {
        throw new AppError(
          'Revisi hanya dapat dilakukan pada versi terkini artifact.',
          409,
          'ERR-003',
        )
      }
    }

    resolved.push({
      artifactId: row.artifactId,
      versionId: row.versionId,
      mode: mention.mode,
      title: row.title,
      kind: row.kind,
      version: row.version,
      attachmentId: row.attachmentId,
      modelId: row.createdByModelId,
      routerModelId: row.createdByRouterModelId,
      locator: {
        bucket: row.r2Bucket,
        key: row.r2Key,
      },
      contentSha256: row.contentSha256,
    })
  }

  return resolved
}

export async function persistArtifactMentions(
  tx: DatabaseTransaction,
  {
    messageId,
    conversationId,
    mentions,
  }: {
    messageId: string
    conversationId?: string
    mentions: readonly ResolvedArtifactMention[]
  },
): Promise<void> {
  if (!mentions.length) return

  let targetConversationId = conversationId
  if (!targetConversationId) {
    const [msg] = await tx
      .select({ conversationId: messages.conversationId })
      .from(messages)
      .where(eq(messages.id, messageId))
    if (!msg) {
      throw new AppError('Pesan tidak ditemukan.', 404, 'ERR-003')
    }
    targetConversationId = msg.conversationId
  }

  await tx.insert(messageArtifactMentions).values(
    mentions.map((mention, index) => ({
      messageId,
      conversationId: targetConversationId,
      artifactId: mention.artifactId,
      versionId: mention.versionId,
      mode: mention.mode,
      position: index,
      titleSnapshot: mention.title,
      kindSnapshot: mention.kind,
      versionSnapshot: mention.version,
    })),
  )
}
