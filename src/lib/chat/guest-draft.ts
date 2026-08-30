const GUEST_DRAFT_KEY = 'zona-ai:guest-draft'
const PENDING_MESSAGE_KEY = 'zona-ai:pending-message'

export type PendingMessage = {
  content: string
  modelId: string
  modelIds?: string[]
  skillId: string
  enableWebSearch: boolean
}

export function saveGuestDraft(content: string) {
  const draft = content.trim()
  if (draft) sessionStorage.setItem(GUEST_DRAFT_KEY, draft)
  else sessionStorage.removeItem(GUEST_DRAFT_KEY)
}

export function takeGuestDraft() {
  const draft = sessionStorage.getItem(GUEST_DRAFT_KEY)?.trim() ?? ''
  sessionStorage.removeItem(GUEST_DRAFT_KEY)
  return draft
}

export function savePendingMessage(message: PendingMessage) {
  sessionStorage.setItem(
    PENDING_MESSAGE_KEY,
    JSON.stringify({ ...message, content: message.content.trim() }),
  )
}

export function takePendingMessage() {
  const stored = sessionStorage.getItem(PENDING_MESSAGE_KEY)
  sessionStorage.removeItem(PENDING_MESSAGE_KEY)
  if (!stored) return null
  try {
    const message: unknown = JSON.parse(stored)
    if (
      typeof message === 'object' &&
      message !== null &&
      'content' in message &&
      'modelId' in message &&
      'skillId' in message &&
      'enableWebSearch' in message &&
      typeof message.content === 'string' &&
      typeof message.modelId === 'string' &&
      typeof message.skillId === 'string' &&
      typeof message.enableWebSearch === 'boolean'
    ) {
      const modelIds =
        'modelIds' in message &&
        Array.isArray(message.modelIds) &&
        message.modelIds.every((id) => typeof id === 'string')
          ? (message.modelIds as string[])
          : undefined
      return {
        content: message.content,
        modelId: message.modelId,
        modelIds,
        skillId: message.skillId,
        enableWebSearch: message.enableWebSearch,
      } satisfies PendingMessage
    }
  } catch {
    return null
  }
  return null
}
