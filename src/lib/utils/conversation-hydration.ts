import type { ChatMessage } from '../../components/chat/MessageList'

type PersistedMessage = {
  id: string
  role: string
  content: string
  generationRuns: Array<{ modelId: string; routerModelId: string }>
}

export function hydrateMessages(messages: PersistedMessage[]): ChatMessage[] {
  return messages.map((message) => {
    const run = message.generationRuns[0]
    return {
      id: message.id,
      role: message.role as ChatMessage['role'],
      content: message.content,
      ...(run
        ? { modelId: run.modelId, routerModelId: run.routerModelId }
        : {}),
    }
  })
}
