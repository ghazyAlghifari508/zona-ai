/**
 * Server-only message helpers.
 * NEVER import from client code — pulls db/postgres into the browser bundle.
 */
import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { ArtifactDescriptor } from '../../lib/artifacts/contracts'
import type { SafeArtifactMention } from '../../lib/artifacts/mentions'
import { getAuthSession } from '../../lib/auth/session'
import { ARTIFACT_SKILL_IDS } from '../../lib/chat/skills'
import { db } from '../../lib/db'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  generationRuns,
  messageArtifactMentions,
  messages,
  webSources,
} from '../../lib/db/schema'
import { AppError } from '../../lib/utils/errors'

const getMessagesSchema = z.object({ conversationId: z.string().uuid() })

export async function getMessagesCore({
  data,
  request,
}: {
  data: z.infer<typeof getMessagesSchema>
  request: Request
}) {
  const session = (await getAuthSession(request)) as { user: { id: string } }
  const [conversation] = await db
    .select({ userId: conversations.userId })
    .from(conversations)
    .where(eq(conversations.id, data.conversationId))
  if (!conversation) throw new AppError('Not Found', 404)
  if (conversation.userId !== session.user.id)
    throw new AppError('Forbidden', 403)

  const [
    messageRows,
    runRows,
    webSourceRows,
    attachmentRows,
    artifactRows,
    mentionRows,
  ] = await Promise.all([
    db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, data.conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id)),
    db
      .select({
        id: generationRuns.id,
        messageId: generationRuns.messageId,
        comparisonRunId: generationRuns.comparisonRunId,
        modelId: generationRuns.modelId,
        routerModelId: generationRuns.routerModelId,
        skillId: generationRuns.skillId,
        status: generationRuns.status,
        content: generationRuns.content,
        reasoningContent: generationRuns.reasoningContent,
        promptTokens: generationRuns.promptTokens,
        completionTokens: generationRuns.completionTokens,
        totalTokens: generationRuns.totalTokens,
        latencyMs: generationRuns.latencyMs,
        timeToFirstTokenMs: generationRuns.timeToFirstTokenMs,
        startedAt: generationRuns.startedAt,
        completedAt: generationRuns.completedAt,
        error: generationRuns.error,
      })
      .from(generationRuns)
      .where(eq(generationRuns.conversationId, data.conversationId)),
    db
      .select()
      .from(webSources)
      .where(eq(webSources.conversationId, data.conversationId)),
    db
      .select({
        id: attachments.id,
        messageId: attachments.messageId,
        fileName: attachments.fileName,
        fileSize: attachments.fileSize,
        mimeType: attachments.mimeType,
        processingStatus: attachments.processingStatus,
      })
      .from(attachments)
      .where(eq(attachments.conversationId, data.conversationId)),
    db
      .select({
        generationId: artifactVersions.generationRunId,
        artifactId: artifactVersions.artifactId,
        versionId: artifactVersions.id,
        attachmentId: artifactVersions.attachmentId,
        title: artifactVersions.title,
        version: artifactVersions.version,
        modelId: artifactVersions.createdByModelId,
        routerModelId: artifactVersions.createdByRouterModelId,
        kind: artifacts.kind,
        fileName: attachments.fileName,
        fileSize: attachments.fileSize,
        mimeType: attachments.mimeType,
      })
      .from(artifactVersions)
      .innerJoin(
        artifacts,
        and(
          eq(artifacts.id, artifactVersions.artifactId),
          eq(artifacts.conversationId, data.conversationId),
        ),
      )
      .innerJoin(
        attachments,
        and(
          eq(attachments.id, artifactVersions.attachmentId),
          eq(attachments.conversationId, data.conversationId),
        ),
      )
      .where(eq(artifactVersions.conversationId, data.conversationId)),
    db
      .select({
        messageId: messageArtifactMentions.messageId,
        artifactId: messageArtifactMentions.artifactId,
        versionId: messageArtifactMentions.versionId,
        mode: messageArtifactMentions.mode,
        position: messageArtifactMentions.position,
        title: messageArtifactMentions.titleSnapshot,
        kind: messageArtifactMentions.kindSnapshot,
        version: messageArtifactMentions.versionSnapshot,
      })
      .from(messageArtifactMentions)
      .where(eq(messageArtifactMentions.conversationId, data.conversationId))
      .orderBy(asc(messageArtifactMentions.position)),
  ])
  const artifactByGeneration = new Map<string, ArtifactDescriptor>()
  for (const row of artifactRows) {
    if (row.mimeType !== 'text/markdown') continue
    artifactByGeneration.set(row.generationId, {
      artifactId: row.artifactId,
      versionId: row.versionId,
      attachmentId: row.attachmentId,
      generationId: row.generationId,
      kind: row.kind,
      title: row.title,
      fileName: row.fileName,
      fileSize: row.fileSize,
      mimeType: 'text/markdown',
      version: row.version,
      modelId: row.modelId,
      routerModelId: row.routerModelId,
    })
  }
  const sourcesByGeneration = new Map<string, typeof webSourceRows>()
  for (const src of webSourceRows) {
    const arr = sourcesByGeneration.get(src.generationRunId) ?? []
    arr.push(src)
    sourcesByGeneration.set(src.generationRunId, arr)
  }
  const redactedRunRows = runRows.map((run) => {
    const artifact = artifactByGeneration.get(run.id)
    const isArtifactRun =
      run.status === 'completed' &&
      ((ARTIFACT_SKILL_IDS as readonly string[]).includes(run.skillId ?? '') ||
        artifact !== undefined)
    return {
      ...run,
      content: isArtifactRun ? null : run.content,
      artifact,
    }
  })
  const runsByMessage = new Map<
    string,
    Array<
      (typeof runRows)[number] & {
        webSources: typeof webSourceRows
        artifact: ArtifactDescriptor | undefined
      }
    >
  >()
  for (const run of redactedRunRows) {
    const withSources = {
      ...run,
      webSources: (sourcesByGeneration.get(run.id) ?? []).sort(
        (a, b) => a.position - b.position,
      ),
    }
    const runs = runsByMessage.get(run.messageId) ?? []
    runs.push(withSources)
    runsByMessage.set(run.messageId, runs)
  }
  const attachmentsByMessage = new Map<string, typeof attachmentRows>()
  for (const att of attachmentRows) {
    if (att.messageId) {
      const arr = attachmentsByMessage.get(att.messageId) ?? []
      arr.push(att)
      attachmentsByMessage.set(att.messageId, arr)
    }
  }
  const mentionsByMessage = new Map<string, SafeArtifactMention[]>()
  for (const m of mentionRows) {
    const arr = mentionsByMessage.get(m.messageId) ?? []
    arr.push({
      artifactId: m.artifactId,
      versionId: m.versionId,
      mode: m.mode,
      position: m.position,
      title: m.title,
      kind: m.kind,
      version: m.version,
    })
    mentionsByMessage.set(m.messageId, arr)
  }
  return messageRows.map((message) => ({
    ...message,
    generationRuns: runsByMessage.get(message.id) ?? [],
    attachments: attachmentsByMessage.get(message.id) ?? [],
    artifactMentions: mentionsByMessage.get(message.id) ?? [],
  }))
}
