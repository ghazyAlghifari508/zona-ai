import type { ChatMessage } from '../../components/chat/MessageList'

type PersistedMessage = {
  id: string
  role: string
  content: string
  generationRuns: Array<{
    id: string
    modelId: string
    routerModelId: string
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

    if (!compRunId) {
      result.push({
        id: message.id,
        role: 'assistant',
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

    const compareGenerations: NonNullable<ChatMessage['compareGenerations']> =
      []
    const groupId = message.id
    while (i < messages.length) {
      const m = messages[i]
      const r = m.generationRuns[0]
      if (m.role !== 'assistant' || r?.comparisonRunId !== compRunId) break
      compareGenerations.push({
        id: r.id,
        modelId: r.modelId,
        status: r.status,
        content: r.content ?? m.content ?? '',
        reasoningContent: r.reasoningContent,
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        totalTokens: r.totalTokens,
        latencyMs: r.latencyMs,
        timeToFirstTokenMs: r.timeToFirstTokenMs,
        comparisonRunId: r.comparisonRunId,
        messageId: m.id,
        error: r.error,
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
