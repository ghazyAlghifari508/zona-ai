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

  it('hydrates artifact from persisted attachments for PRD Plan assistant messages', () => {
    const hydrated = hydrateMessages([
      {
        id: 'msg-user-prd',
        role: 'user',
        content: 'buatkan PRD fitur login',
        generationRuns: [],
      },
      {
        id: 'msg-asst-prd',
        role: 'assistant',
        content: 'PRD selesai dibuat.',
        attachments: [
          {
            id: 'att-prd-1',
            fileName: 'PRD-Fitur-Login.md',
            fileSize: 18432,
            mimeType: 'text/markdown',
            processingStatus: 'completed',
          },
        ],
        generationRuns: [
          {
            id: 'gen-prd-1',
            modelId: 'gpt-5.6-sol',
            routerModelId: 'openai/gpt-4o',
            skillId: 'prd-plan',
            status: 'completed',
            content: 'PRD selesai dibuat.',
            comparisonRunId: null,
            messageId: 'msg-asst-prd',
          },
        ],
      },
    ])

    expect(hydrated).toHaveLength(2)
    expect(hydrated[1]).toMatchObject({
      id: 'msg-asst-prd',
      role: 'assistant',
      content: 'PRD selesai dibuat.',
      artifactStatus: 'completed',
      artifactKind: 'prd',
      artifact: {
        kind: 'prd',
        attachmentId: 'att-prd-1',
        fileName: 'PRD-Fitur-Login.md',
        fileSize: 18432,
        mimeType: 'text/markdown',
      },
    })
  })

  it('hydrates agent-skill markdown attachments with agent-skill kind, never PRD kind', () => {
    const hydrated = hydrateMessages([
      {
        id: 'msg-user-skill',
        role: 'user',
        content: 'buatkan skill untuk review kode',
        generationRuns: [],
      },
      {
        id: 'msg-asst-skill',
        role: 'assistant',
        content: 'Skill selesai dibuat.',
        attachments: [
          {
            id: 'att-skill-1',
            fileName: 'code-review.md',
            fileSize: 9216,
            mimeType: 'text/markdown',
            processingStatus: 'completed',
          },
        ],
        generationRuns: [
          {
            id: 'gen-skill-1',
            modelId: 'gpt-5.6-sol',
            routerModelId: 'openai/gpt-4o',
            skillId: 'agent-skill',
            status: 'completed',
            content: 'Skill selesai dibuat.',
            comparisonRunId: null,
            messageId: 'msg-asst-skill',
          },
        ],
      },
    ])

    expect(hydrated).toHaveLength(2)
    expect(hydrated[1]).toMatchObject({
      id: 'msg-asst-skill',
      role: 'assistant',
      content: 'Skill selesai dibuat.',
      artifactStatus: 'completed',
      artifactKind: 'agent-skill',
      artifact: {
        kind: 'agent-skill',
        attachmentId: 'att-skill-1',
        fileName: 'code-review.md',
        fileSize: 9216,
        mimeType: 'text/markdown',
      },
    })
    const artifact = hydrated[1].artifact
    expect(artifact?.kind).not.toBe('prd')
  })

  it('keeps historical agent-skill text without an attachment as ordinary content', () => {
    const hydrated = hydrateMessages([
      {
        id: 'msg-asst-legacy',
        role: 'assistant',
        content: 'Berikut draf skill yang diminta.',
        generationRuns: [
          {
            id: 'gen-legacy-1',
            modelId: 'gpt-5.6-sol',
            routerModelId: 'openai/gpt-4o',
            skillId: 'agent-skill',
            status: 'completed',
            content: 'Berikut draf skill yang diminta.',
            comparisonRunId: null,
            messageId: 'msg-asst-legacy',
          },
        ],
      },
    ])

    expect(hydrated).toHaveLength(1)
    expect(hydrated[0]).toMatchObject({
      id: 'msg-asst-legacy',
      role: 'assistant',
      content: 'Berikut draf skill yang diminta.',
    })
    expect(hydrated[0]).not.toHaveProperty('artifact')
    expect(hydrated[0]).not.toHaveProperty('artifactStatus')
  })
})
