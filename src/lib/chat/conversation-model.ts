type PersistedRun = {
  modelId?: string | null
  comparisonRunId?: string | null
}

type PersistedMessage = {
  generationRuns?: Array<PersistedRun> | null
}

function clean(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export function resolveConversationModelId(args: {
  conversationModelId?: string | null
  persistedMessages?: Array<PersistedMessage> | null
  defaultModelId: string
}): string {
  const stored = clean(args.conversationModelId)
  if (stored) return stored
  const messages = args.persistedMessages
  if (Array.isArray(messages)) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const runs = messages[i]?.generationRuns
      if (!Array.isArray(runs)) continue
      const run = runs.find(
        (candidate) => !candidate?.comparisonRunId && clean(candidate?.modelId),
      )
      const derived = clean(run?.modelId)
      if (derived) return derived
    }
  }
  return args.defaultModelId
}
