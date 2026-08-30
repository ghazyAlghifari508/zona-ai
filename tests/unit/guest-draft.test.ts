import { afterEach, describe, expect, it } from 'vitest'
import {
  saveGuestDraft,
  savePendingMessage,
  takeGuestDraft,
  takePendingMessage,
  takePendingMessageForConversation,
} from '../../src/lib/chat/guest-draft'

describe('guest chat draft', () => {
  afterEach(() => sessionStorage.clear())

  it('returns the saved trimmed draft once', () => {
    saveGuestDraft('  Jelaskan quantum computing  ')

    expect(takeGuestDraft()).toBe('Jelaskan quantum computing')
    expect(takeGuestDraft()).toBe('')
  })

  it('does not retain an empty draft', () => {
    saveGuestDraft('   ')

    expect(takeGuestDraft()).toBe('')
  })

  it('keeps an authenticated submit separate from the guest draft', () => {
    saveGuestDraft('guest draft')
    savePendingMessage({
      conversationId: 'conversation-1',
      content: 'send this',
      modelId: 'auto',
      skillId: 'none',
      enableWebSearch: false,
    })

    expect(takePendingMessage()).toEqual({
      conversationId: 'conversation-1',
      content: 'send this',
      modelId: 'auto',
      skillId: 'none',
      enableWebSearch: false,
    })
    expect(takeGuestDraft()).toBe('guest draft')
  })

  it('only consumes a pending message from its target conversation', () => {
    savePendingMessage({
      conversationId: 'conversation-1',
      content: 'send this',
      modelId: 'auto',
      skillId: 'none',
      enableWebSearch: false,
    })

    expect(takePendingMessageForConversation('conversation-2')).toBeNull()
    expect(takePendingMessageForConversation('conversation-1')).toEqual({
      conversationId: 'conversation-1',
      content: 'send this',
      modelId: 'auto',
      skillId: 'none',
      enableWebSearch: false,
    })
    expect(takePendingMessageForConversation('conversation-1')).toBeNull()
  })
})
