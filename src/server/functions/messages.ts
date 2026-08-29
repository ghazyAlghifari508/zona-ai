import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db'
import {
  conversations,
  generationRuns,
  messages,
  webSources,
} from '../../lib/db/schema'

const getMessagesSchema = z.object({ conversationId: z.string().uuid() })

import { AppError } from '../../lib/utils/errors'

function httpError(status: number, message: string): AppError {
  return new AppError(message, status)
}

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
  if (!conversation) throw httpError(404, 'Not Found')
  if (conversation.userId !== session.user.id) throw httpError(403, 'Forbidden')

  const [messageRows, runRows, webSourceRows] = await Promise.all([
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
      })
      .from(generationRuns)
      .where(eq(generationRuns.conversationId, data.conversationId)),
    db
      .select()
      .from(webSources)
      .where(eq(webSources.conversationId, data.conversationId)),
  ])
  const sourcesByGeneration = new Map<string, typeof webSourceRows>()
  for (const src of webSourceRows) {
    const arr = sourcesByGeneration.get(src.generationRunId) ?? []
    arr.push(src)
    sourcesByGeneration.set(src.generationRunId, arr)
  }
  const runsByMessage = new Map<
    string,
    Array<(typeof runRows)[number] & { webSources: typeof webSourceRows }>
  >()
  for (const run of runRows) {
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
  return messageRows.map((message) => ({
    ...message,
    generationRuns: runsByMessage.get(message.id) ?? [],
  }))
}

export const getMessages = createServerFn({ method: 'GET' })
  .validator((data: unknown) => getMessagesSchema.parse(data))
  .handler(({ data }) =>
    getMessagesCore({ data, request: getRequest() as Request }),
  )
