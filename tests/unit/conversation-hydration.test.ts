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

  it('groups consecutive assistant messages sharing a comparisonRunId into one compare message', () => {
    const compRunId = 'comp-run-123'
    const hydrated = hydrateMessages([
      {
        id: 'msg-user-1',
        role: 'user',
        content: 'Bandingkan dua model ini',
        generationRuns: [],
      },
      {
        id: 'msg-asst-1',
        role: 'assistant',
        content: 'Jawaban Gemini',
        generationRuns: [
          {
            id: 'gen-1',
            modelId: 'gemini-3.7-flash-high',
            routerModelId: 'google/gemini-2.5-flash',
            status: 'completed',
            content: 'Jawaban Gemini',
            comparisonRunId: compRunId,
            messageId: 'msg-asst-1',
          },
        ],
      },
      {
        id: 'msg-asst-2',
        role: 'assistant',
        content: 'Jawaban GPT',
        generationRuns: [
          {
            id: 'gen-2',
            modelId: 'gpt-5.6-sol',
            routerModelId: 'openai/gpt-4o',
            status: 'completed',
            content: 'Jawaban GPT',
            comparisonRunId: compRunId,
            messageId: 'msg-asst-2',
          },
        ],
      },
      {
        id: 'msg-user-2',
        role: 'user',
        content: 'Lanjut tanya biasa',
        generationRuns: [],
      },
      {
        id: 'msg-asst-3',
        role: 'assistant',
        content: 'Jawaban normal',
        generationRuns: [
          {
            id: 'gen-3',
            modelId: 'gemini-3.7-flash-high',
            routerModelId: 'google/gemini-2.5-flash',
            status: 'completed',
            content: 'Jawaban normal',
            comparisonRunId: null,
            messageId: 'msg-asst-3',
          },
        ],
      },
    ])

    expect(hydrated).toHaveLength(4)
    expect(hydrated[0]).toMatchObject({
      id: 'msg-user-1',
      role: 'user',
      content: 'Bandingkan dua model ini',
    })
    expect(hydrated[1]).toMatchObject({
      role: 'assistant',
      compareGenerations: [
        expect.objectContaining({
          id: 'gen-1',
          modelId: 'gemini-3.7-flash-high',
          content: 'Jawaban Gemini',
        }),
        expect.objectContaining({
          id: 'gen-2',
          modelId: 'gpt-5.6-sol',
          content: 'Jawaban GPT',
        }),
      ],
    })
    expect(hydrated[2]).toMatchObject({
      id: 'msg-user-2',
      role: 'user',
      content: 'Lanjut tanya biasa',
    })
    expect(hydrated[3]).toMatchObject({
      id: 'msg-asst-3',
      role: 'assistant',
      content: 'Jawaban normal',
      modelId: 'gemini-3.7-flash-high',
    })
  })
})
