import { and, desc, eq } from 'drizzle-orm'
import type {
  ArtifactDetail,
  ArtifactKind,
  ArtifactSummary,
  ArtifactVersionDescriptor,
} from '../../lib/artifacts/contracts'
import { db } from '../../lib/db/index'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  generationRuns,
} from '../../lib/db/schema'
import type { StoredObjectLocator } from '../../lib/r2/client'
import { AppError } from '../../lib/utils/errors'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-repository.ts is server-only')
}

export type OwnedArtifactVersionSource = {
  artifactId: string
  versionId: string
  conversationId: string
  attachmentId: string
  kind: ArtifactKind
  title: string
  version: number
  fileName: string
  fileSize: number
  mimeType: 'text/markdown'
  modelId: string
  routerModelId: string
  contentSha256: string | null
  locator: StoredObjectLocator
}

type OwnedArtifactVersionRow = {
  artifactId: string
  artifactKind: ArtifactKind
  artifactTitle: string
  currentVersionId: string | null
  artifactCreatedAt: Date | null
  artifactUpdatedAt: Date | null
  versionId: string
  version: number
  sourceVersionId: string | null
  versionTitle: string
  contentSha256: string | null
  changeSummary: string
  versionCreatedAt: Date | null
  attachmentId: string
  fileName: string
  fileSize: number
  mimeType: string
  r2Bucket: string
  r2Key: string
  modelId: string
  routerModelId: string
  generationId: string
  conversationId: string
}

const ownedArtifactVersionProjection = {
  artifactId: artifacts.id,
  artifactKind: artifacts.kind,
  artifactTitle: artifacts.title,
  currentVersionId: artifacts.currentVersionId,
  artifactCreatedAt: artifacts.createdAt,
  artifactUpdatedAt: artifacts.updatedAt,
  versionId: artifactVersions.id,
  version: artifactVersions.version,
  sourceVersionId: artifactVersions.sourceVersionId,
  versionTitle: artifactVersions.title,
  contentSha256: artifactVersions.contentSha256,
  changeSummary: artifactVersions.changeSummary,
  versionCreatedAt: artifactVersions.createdAt,
  attachmentId: attachments.id,
  fileName: attachments.fileName,
  fileSize: attachments.fileSize,
  mimeType: attachments.mimeType,
  r2Bucket: attachments.r2Bucket,
  r2Key: attachments.r2Key,
  modelId: artifactVersions.createdByModelId,
  routerModelId: artifactVersions.createdByRouterModelId,
  generationId: generationRuns.id,
  conversationId: conversations.id,
}

function ownedArtifactVersionQuery(userId: string) {
  return db
    .select(ownedArtifactVersionProjection)
    .from(artifacts)
    .innerJoin(
      conversations,
      and(
        eq(conversations.id, artifacts.conversationId),
        eq(conversations.userId, artifacts.userId),
        eq(conversations.userId, userId),
      ),
    )
    .innerJoin(
      artifactVersions,
      and(
        eq(artifactVersions.artifactId, artifacts.id),
        eq(artifactVersions.conversationId, artifacts.conversationId),
      ),
    )
    .innerJoin(
      attachments,
      and(
        eq(attachments.id, artifactVersions.attachmentId),
        eq(attachments.conversationId, artifacts.conversationId),
        eq(attachments.userId, userId),
      ),
    )
    .innerJoin(
      generationRuns,
      and(
        eq(generationRuns.id, artifactVersions.generationRunId),
        eq(generationRuns.conversationId, artifacts.conversationId),
        eq(generationRuns.messageId, attachments.messageId),
      ),
    )
}

function artifactMarkdownMimeType(
  mimeType: string,
  fileName: string,
): 'text/markdown' {
  if (mimeType !== 'text/markdown' && !fileName.toLowerCase().endsWith('.md')) {
    throw new AppError('Artifact content is unavailable.', 500, 'ERR-013')
  }
  return 'text/markdown'
}

function requireTimestamp(value: Date | null): Date {
  if (!value) {
    throw new AppError('Artifact metadata is unavailable.', 500, 'ERR-013')
  }
  return value
}

function toVersionDescriptor(
  row: OwnedArtifactVersionRow,
): ArtifactVersionDescriptor {
  return {
    versionId: row.versionId,
    attachmentId: row.attachmentId,
    generationId: row.generationId,
    title: row.versionTitle,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: artifactMarkdownMimeType(row.mimeType, row.fileName),
    version: row.version,
    modelId: row.modelId,
    routerModelId: row.routerModelId,
    sourceVersionId: row.sourceVersionId,
    changeSummary: row.changeSummary,
    createdAt: requireTimestamp(row.versionCreatedAt),
  }
}

function toSummary(
  rows: OwnedArtifactVersionRow[],
  current: OwnedArtifactVersionRow,
): ArtifactSummary {
  return {
    artifactId: current.artifactId,
    kind: current.artifactKind,
    title: current.artifactTitle,
    attachmentId: current.attachmentId,
    fileName: current.fileName,
    fileSize: current.fileSize,
    mimeType: artifactMarkdownMimeType(current.mimeType, current.fileName),
    modelId: current.modelId,
    routerModelId: current.routerModelId,
    currentVersionId: current.versionId,
    currentVersion: current.version,
    versionCount: rows.length,
    updatedAt: requireTimestamp(current.artifactUpdatedAt),
  }
}

function currentVersionRow(
  rows: OwnedArtifactVersionRow[],
): OwnedArtifactVersionRow {
  const current = rows.find((row) => row.currentVersionId === row.versionId)
  if (!current) {
    throw new AppError('Artifact metadata is unavailable.', 500, 'ERR-013')
  }
  return current
}

export async function getOwnedArtifactVersion({
  userId,
  artifactId,
  versionId,
}: {
  userId: string
  artifactId: string
  versionId: string
}): Promise<OwnedArtifactVersionSource> {
  const [row] = await ownedArtifactVersionQuery(userId).where(
    and(
      eq(artifacts.userId, userId),
      eq(artifacts.id, artifactId),
      eq(artifactVersions.id, versionId),
    ),
  )
  if (!row) throw new AppError('Artifact version not found.', 404, 'ERR-003')

  return {
    artifactId: row.artifactId,
    versionId: row.versionId,
    conversationId: row.conversationId,
    attachmentId: row.attachmentId,
    kind: row.artifactKind,
    title: row.versionTitle,
    version: row.version,
    fileName: row.fileName,
    fileSize: row.fileSize,
    mimeType: artifactMarkdownMimeType(row.mimeType, row.fileName),
    modelId: row.modelId,
    routerModelId: row.routerModelId,
    contentSha256: row.contentSha256,
    locator: { bucket: row.r2Bucket, key: row.r2Key },
  }
}

export async function listConversationArtifactSummaries({
  userId,
  conversationId,
}: {
  userId: string
  conversationId: string
}): Promise<ArtifactSummary[]> {
  const [conversation] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.userId, userId),
      ),
    )
    .limit(1)
  if (!conversation) throw new AppError('Forbidden', 403, 'ERR-003')

  const rows = await ownedArtifactVersionQuery(userId)
    .where(
      and(
        eq(artifacts.userId, userId),
        eq(artifacts.conversationId, conversationId),
      ),
    )
    .orderBy(desc(artifacts.updatedAt), desc(artifactVersions.version))

  const rowsByArtifact = new Map<string, OwnedArtifactVersionRow[]>()
  for (const row of rows) {
    const group = rowsByArtifact.get(row.artifactId)
    if (group) group.push(row)
    else rowsByArtifact.set(row.artifactId, [row])
  }

  return Array.from(rowsByArtifact.values(), (artifactRows) =>
    toSummary(artifactRows, currentVersionRow(artifactRows)),
  )
}

export async function getOwnedArtifact({
  userId,
  artifactId,
}: {
  userId: string
  artifactId: string
}): Promise<ArtifactDetail> {
  const rows = await ownedArtifactVersionQuery(userId)
    .where(and(eq(artifacts.userId, userId), eq(artifacts.id, artifactId)))
    .orderBy(desc(artifactVersions.version))
  if (rows.length === 0)
    throw new AppError('Artifact not found.', 404, 'ERR-003')

  const current = currentVersionRow(rows)
  return {
    ...toSummary(rows, current),
    createdAt: requireTimestamp(current.artifactCreatedAt),
    versions: rows.map(toVersionDescriptor),
  }
}
