import { describe, expect, it } from 'vitest'
import { resolveConversationModelId } from '../../src/lib/chat/conversation-model'

function run(modelId: string, comparisonRunId: string | null = null) {
  return { modelId, comparisonRunId }
}

function message(
  generationRuns: Array<{
    modelId: string
    comparisonRunId: string | null
  }>,
) {
  return { generationRuns }
}

describe('resolveConversationModelId', () => {
  it('prefers the stored conversation model over run history and default', () => {
    expect(
      resolveConversationModelId({
        conversationModelId: 'ag/mimo-v2.5',
        persistedMessages: [
          message([run('ag/qwen3.8-flash')]),
          message([run('ag/gemini-3.7-flash-high')]),
        ],
        defaultModelId: 'auto',
      }),
    ).toBe('ag/mimo-v2.5')
  })

  it('respects an explicit auto stored on the conversation', () => {
    expect(
      resolveConversationModelId({
        conversationModelId: 'auto',
        persistedMessages: [message([run('ag/mimo-v2.5')])],
        defaultModelId: 'ag/gemini-3.7-flash-high',
      }),
    ).toBe('auto')
  })

  it('derives the model from the last run when nothing is stored', () => {
    expect(
      resolveConversationModelId({
        conversationModelId: null,
        persistedMessages: [
          message([run('ag/qwen3.8-flash')]),
          message([run('ag/mimo-v2.5')]),
        ],
        defaultModelId: 'auto',
      }),
    ).toBe('ag/mimo-v2.5')
  })

  it('uses the user message run when no assistant run exists yet', () => {
    expect(
      resolveConversationModelId({
        conversationModelId: null,
        persistedMessages: [message([run('ag/qwen3.8-flash')])],
        defaultModelId: 'auto',
      }),
    ).toBe('ag/qwen3.8-flash')
  })

  it('skips compare runs and falls back to default', () => {
    expect(
      resolveConversationModelId({
        conversationModelId: null,
        persistedMessages: [
          message([run('ag/mimo-v2.5', 'cmp-1')]),
          message([run('ag/qwen3.8-flash', 'cmp-1')]),
        ],
        defaultModelId: 'auto',
      }),
    ).toBe('auto')
  })

  it('falls back to default when there are no messages', () => {
    expect(
      resolveConversationModelId({
        conversationModelId: null,
        persistedMessages: [],
        defaultModelId: 'ag/gemini-3.7-flash-high',
      }),
    ).toBe('ag/gemini-3.7-flash-high')
  })

  it('treats blank stored values as unset', () => {
    expect(
      resolveConversationModelId({
        conversationModelId: '   ',
        persistedMessages: [message([run('ag/mimo-v2.5')])],
        defaultModelId: 'auto',
      }),
    ).toBe('ag/mimo-v2.5')
  })

  it('trims a padded stored value', () => {
    expect(
      resolveConversationModelId({
        conversationModelId: '  ag/mimo-v2.5  ',
        persistedMessages: [],
        defaultModelId: 'auto',
      }),
    ).toBe('ag/mimo-v2.5')
  })
})
