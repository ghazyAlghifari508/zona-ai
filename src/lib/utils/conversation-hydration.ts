import type { ChatMessage } from '../../components/chat/MessageList'

type PersistedMessage = {
  id: string
  role: string
  content: string
  attachments?: Array<{
    id: string
    fileName: string
    fileSize: number
    mimeType: string
    processingStatus?: string
  }>
  generationRuns: Array<{
    id: string
    modelId: string
    routerModelId: string
    skillId?: string | null
    status: string
    content?: string | null
    reasoningContent?: string | null
    comparisonRunId?: string | null
    messageId?: string
    promptTokens?: number | null
    completionTokens?: number | null
    totalTokens?: number | null
    latencyMs?: number | null
    timeToFirstTokenMs?: number | null
    error?: unknown
    webSources?: Array<{
      url: string
      title: string | null
      snippet: string | null
      position: number
      score?: number | null
    }>
  }>
}

export function hydrateMessages(messages: PersistedMessage[]): ChatMessage[] {
  const result: ChatMessage[] = []
  let i = 0

  while (i < messages.length) {
    const message = messages[i]

    if (message.role !== 'assistant') {
      const run = message.generationRuns[0]
      result.push({
        id: message.id,
        role: message.role as ChatMessage['role'],
        content: message.content,
        ...(run
          ? {
              modelId: run.modelId,
              routerModelId: run.routerModelId,
              webSources: run.webSources ?? undefined,
            }
          : {}),
      })
      i++
      continue
    }

    const run = message.generationRuns[0]
    const compRunId = run?.comparisonRunId
    const prdAttachment = message.attachments?.find(
      (a) => a.mimeType === 'text/markdown' || a.fileName.endsWith('.md'),
    )
    const isPrd =
      (run?.skillId === 'prd-plan' || Boolean(prdAttachment)) &&
      Boolean(prdAttachment)

    if (!compRunId) {
      const rawContent = message.content ?? run?.content ?? ''
      const hasContent = Boolean(rawContent && rawContent.trim().length > 0)
      const isFailed =
        run?.status === 'failed' ||
        (!hasContent && !isPrd && run?.status === 'completed')

      result.push({
        id: message.id,
        role: 'assistant',
        content: isFailed && !hasContent ? '' : rawContent,
        ...(run
          ? {
              modelId: run.modelId,
              routerModelId: run.routerModelId,
              webSources: run.webSources ?? undefined,
            }
          : {}),
        ...(isFailed && !isPrd
          ? {
              errorCode:
                typeof run?.error === 'object' &&
                run?.error &&
                'code' in run.error
                  ? String((run.error as { code: unknown }).code)
                  : 'ERR-001',
              errorMessage:
                typeof run?.error === 'object' &&
                run?.error &&
                'message' in run.error
                  ? String((run.error as { message: unknown }).message)
                  : 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
            }
          : {}),
        ...(isPrd && prdAttachment
          ? {
              prdStatus: 'completed' as const,
              prdArtifact: {
                attachmentId: prdAttachment.id,
                fileName: prdAttachment.fileName,
                fileSize: prdAttachment.fileSize,
                mimeType: prdAttachment.mimeType,
              },
            }
          : {}),
      })
      i++
      continue
    }

    const compareGenerations: NonNullable<ChatMessage['compareGenerations']> =
      []
    const groupId = message.id
    while (i < messages.length) {
      const m = messages[i]
      const r = m.generationRuns[0]
      if (m.role !== 'assistant' || r?.comparisonRunId !== compRunId) break

      const rawContent = r.content ?? m.content ?? ''
      const hasContent = Boolean(rawContent && rawContent.trim().length > 0)
      const isFailed =
        r.status === 'failed' || (!hasContent && r.status === 'completed')
      const finalStatus = isFailed ? 'failed' : r.status
      const finalError =
        isFailed && !r.error
          ? {
              message: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
              code: 'ERR-001',
            }
          : r.error

      compareGenerations.push({
        id: r.id,
        modelId: r.modelId,
        status: finalStatus,
        content: isFailed && !hasContent ? '' : rawContent,
        reasoningContent: r.reasoningContent,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        latencyMs: r.latencyMs,
        timeToFirstTokenMs: r.timeToFirstTokenMs,
        comparisonRunId: r.comparisonRunId,
        messageId: m.id,
        error: finalError,
        webSources: r.webSources,
      })
      i++
    }

    result.push({
      id: groupId,
      role: 'assistant',
      content: '',
      compareGenerations,
    })
  }

  return result
}
