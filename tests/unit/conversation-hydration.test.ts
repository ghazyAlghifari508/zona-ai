import { describe, expect, it } from 'vitest'
import { hydrateMessages } from '../../src/lib/utils/conversation-hydration'

describe('conversation reload hydration', () => {
  it('restores message content and assistant model metadata', () => {
    const hydrated = hydrateMessages([
      {
        id: '10000000-0000-4000-8000-000000000020',
        conversationId: '10000000-0000-4000-8000-000000000021',
        role: 'assistant',
        content: 'Persisted answer',
        createdAt: new Date('2026-08-29T00:00:00Z'),
        generationRuns: [
          {
            id: '10000000-0000-4000-8000-000000000022',
            messageId: '10000000-0000-4000-8000-000000000020',
            modelId: 'auto',
            routerModelId: 'test/router',
            skillId: null,
            status: 'completed',
            content: 'Persisted answer',
            reasoningContent: null,
            promptTokens: 1,
            completionTokens: 2,
            totalTokens: 3,
            latencyMs: 10,
            timeToFirstTokenMs: 2,
            startedAt: null,
            completedAt: null,
          },
        ],
      },
    ])

    expect(hydrated).toEqual([
      {
        id: '10000000-0000-4000-8000-000000000020',
        role: 'assistant',
        content: 'Persisted answer',
        modelId: 'auto',
        routerModelId: 'test/router',
      },
    ])
  })
})
