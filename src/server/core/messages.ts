/**
 * Server-only message helpers.
 * NEVER import from client code — pulls db/postgres into the browser bundle.
 */
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getAuthSession } from '../../lib/auth/session'
import { ARTIFACT_SKILL_IDS } from '../../lib/chat/skills'
import { db } from '../../lib/db'
import {
  attachments,
  conversations,
  generationRuns,
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

  const [messageRows, runRows, webSourceRows, attachmentRows] =
    await Promise.all([
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
    ])
  const sourcesByGeneration = new Map<string, typeof webSourceRows>()
  for (const src of webSourceRows) {
    const arr = sourcesByGeneration.get(src.generationRunId) ?? []
    arr.push(src)
    sourcesByGeneration.set(src.generationRunId, arr)
  }
  const redactedRunRows = runRows.map((run) =>
    run.status === 'completed' &&
    (ARTIFACT_SKILL_IDS as readonly string[]).includes(run.skillId ?? '')
      ? { ...run, content: null }
      : run,
  )
  const runsByMessage = new Map<
    string,
    Array<(typeof runRows)[number] & { webSources: typeof webSourceRows }>
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
  return messageRows.map((message) => ({
    ...message,
    generationRuns: runsByMessage.get(message.id) ?? [],
    attachments: attachmentsByMessage.get(message.id) ?? [],
  }))
}
