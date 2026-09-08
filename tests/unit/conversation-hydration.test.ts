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
        generationRunId: '10000000-0000-4000-8000-000000000022',
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

  it('hydrates PRD safe descriptors with logical and version identity', () => {
    const descriptor = {
      artifactId: 'aaaaaaaa-0000-4000-8000-000000000001',
      versionId: 'aaaaaaaa-0000-4000-8000-000000000002',
      attachmentId: 'aaaaaaaa-0000-4000-8000-000000000003',
      generationId: 'aaaaaaaa-0000-4000-8000-000000000004',
      kind: 'prd',
      title: 'Login PRD',
      fileName: 'login-prd.md',
      fileSize: 4096,
      mimeType: 'text/markdown',
      version: 1,
      modelId: 'gpt-5.6-sol',
      routerModelId: 'openai/gpt-4o',
    } as const
    const hydrated = hydrateMessages([
      {
        id: 'msg-asst-prd-safe',
        role: 'assistant',
        content: 'Summary ready.',
        generationRuns: [
          {
            id: 'aaaaaaaa-0000-4000-8000-000000000004',
            modelId: 'gpt-5.6-sol',
            routerModelId: 'openai/gpt-4o',
            skillId: 'prd-plan',
            status: 'completed',
            content: null,
            comparisonRunId: null,
            messageId: 'msg-asst-prd-safe',
            artifact: descriptor,
          },
        ],
      },
    ])
    expect(hydrated).toHaveLength(1)
    expect(hydrated[0]).toMatchObject({
      id: 'msg-asst-prd-safe',
      artifactStatus: 'completed',
      artifactKind: 'prd',
    })
    expect(hydrated[0].artifact).toEqual(descriptor)
    expect(hydrated[0].artifact?.artifactId).toBe(descriptor.artifactId)
    expect(hydrated[0].artifact?.versionId).toBe(descriptor.versionId)
    expect(hydrated[0].artifact).not.toHaveProperty('r2Key')
    expect(hydrated[0].artifact).not.toHaveProperty('r2Bucket')
  })

  it('hydrates agent-skill safe descriptors with logical and version identity', () => {
    const descriptor = {
      artifactId: 'bbbbbbbb-0000-4000-8000-000000000001',
      versionId: 'bbbbbbbb-0000-4000-8000-000000000002',
      attachmentId: 'bbbbbbbb-0000-4000-8000-000000000003',
      generationId: 'bbbbbbbb-0000-4000-8000-000000000004',
      kind: 'agent-skill',
      title: 'Review Skill',
      fileName: 'review-skill.md',
      fileSize: 2048,
      mimeType: 'text/markdown',
      version: 2,
      modelId: 'gpt-5.6-sol',
      routerModelId: 'openai/gpt-4o',
    } as const
    const hydrated = hydrateMessages([
      {
        id: 'msg-asst-skill-safe',
        role: 'assistant',
        content: 'Skill summary.',
        generationRuns: [
          {
            id: 'bbbbbbbb-0000-4000-8000-000000000004',
            modelId: 'gpt-5.6-sol',
            routerModelId: 'openai/gpt-4o',
            skillId: 'agent-skill',
            status: 'completed',
            content: null,
            comparisonRunId: null,
            messageId: 'msg-asst-skill-safe',
            artifact: descriptor,
          },
        ],
      },
    ])
    expect(hydrated[0].artifact).toEqual(descriptor)
    expect(hydrated[0]).toMatchObject({
      artifactKind: 'agent-skill',
      artifactStatus: 'completed',
    })
  })

  it('hydrates checklist safe descriptors with logical and version identity', () => {
    const descriptor = {
      artifactId: 'cccccccc-0000-4000-8000-000000000001',
      versionId: 'cccccccc-0000-4000-8000-000000000002',
      attachmentId: 'cccccccc-0000-4000-8000-000000000003',
      generationId: 'cccccccc-0000-4000-8000-000000000004',
      kind: 'checklist',
      title: 'Launch Checklist',
      fileName: 'launch-checklist.md',
      fileSize: 1024,
      mimeType: 'text/markdown',
      version: 1,
      modelId: 'gemini-3.7-flash-high',
      routerModelId: 'google/gemini-2.5-flash',
    } as const
    const hydrated = hydrateMessages([
      {
        id: 'msg-asst-checklist-safe',
        role: 'assistant',
        content: 'Checklist summary.',
        generationRuns: [
          {
            id: 'cccccccc-0000-4000-8000-000000000004',
            modelId: 'gemini-3.7-flash-high',
            routerModelId: 'google/gemini-2.5-flash',
            skillId: 'checklist',
            status: 'completed',
            content: null,
            comparisonRunId: null,
            messageId: 'msg-asst-checklist-safe',
            artifact: descriptor,
          },
        ],
      },
    ])
    expect(hydrated[0].artifact).toEqual(descriptor)
    expect(hydrated[0]).toMatchObject({
      artifactKind: 'checklist',
      artifactStatus: 'completed',
    })
  })

  it('hydrates compare groups with successful descriptors while preserving failed siblings', () => {
    const compRunId = 'dddddddd-0000-4000-8000-000000000000'
    const successDescriptor = {
      artifactId: 'dddddddd-0000-4000-8000-000000000001',
      versionId: 'dddddddd-0000-4000-8000-000000000002',
      attachmentId: 'dddddddd-0000-4000-8000-000000000003',
      generationId: 'dddddddd-0000-4000-8000-000000000004',
      kind: 'checklist',
      title: 'Compare Checklist A',
      fileName: 'compare-a.md',
      fileSize: 512,
      mimeType: 'text/markdown',
      version: 1,
      modelId: 'gemini-3.7-flash-high',
      routerModelId: 'google/gemini-2.5-flash',
    } as const
    const hydrated = hydrateMessages([
      {
        id: 'msg-compare-a',
        role: 'assistant',
        content: '',
        generationRuns: [
          {
            id: 'dddddddd-0000-4000-8000-000000000004',
            modelId: 'gemini-3.7-flash-high',
            routerModelId: 'google/gemini-2.5-flash',
            skillId: 'checklist',
            status: 'completed',
            content: null,
            comparisonRunId: compRunId,
            messageId: 'msg-compare-a',
            artifact: successDescriptor,
          },
        ],
      },
      {
        id: 'msg-compare-b',
        role: 'assistant',
        content: '',
        generationRuns: [
          {
            id: 'dddddddd-0000-4000-8000-000000000005',
            modelId: 'gpt-5.6-sol',
            routerModelId: 'openai/gpt-4o',
            skillId: 'checklist',
            status: 'failed',
            content: '',
            comparisonRunId: compRunId,
            messageId: 'msg-compare-b',
            error: { message: 'boom', code: 'ERR-016' },
          },
        ],
      },
    ])
    expect(hydrated).toHaveLength(1)
    const group = hydrated[0]
    expect(group.compareGenerations).toHaveLength(2)
    expect(group.compareGenerations?.[0].artifact).toEqual(successDescriptor)
    expect(group.compareGenerations?.[0].status).toBe('completed')
    expect(group.compareGenerations?.[1].status).toBe('failed')
    expect(group.compareGenerations?.[1]).not.toHaveProperty('artifact')
  })

  it('keeps historical checklist JSON chat content as ordinary content', () => {
    const checklistJson = JSON.stringify({
      type: 'checklist',
      title: 'Old list',
      items: [
        { id: '1', text: 'first', completed: false },
        { id: '2', text: 'second', completed: true },
      ],
    })
    const hydrated = hydrateMessages([
      {
        id: 'msg-historical-checklist',
        role: 'assistant',
        content: checklistJson,
        generationRuns: [
          {
            id: 'eeeeeeee-0000-4000-8000-000000000001',
            modelId: 'auto',
            routerModelId: 'test/router',
            skillId: 'none',
            status: 'completed',
            content: checklistJson,
            comparisonRunId: null,
            messageId: 'msg-historical-checklist',
          },
        ],
      },
    ])
    expect(hydrated).toHaveLength(1)
    expect(hydrated[0].content).toBe(checklistJson)
    expect(hydrated[0]).not.toHaveProperty('artifact')
    expect(hydrated[0]).not.toHaveProperty('artifactStatus')
  })

  it('hydrates user message with persisted artifactMentions preserving snapshot data', () => {
    const hydrated = hydrateMessages([
      {
        id: 'msg-user-with-mentions',
        role: 'user',
        content: 'Please summarize this',
        artifactMentions: [
          {
            artifactId: '10000000-0000-4000-8000-000000000001',
            versionId: '10000000-0000-4000-8000-000000000002',
            mode: 'context',
            position: 0,
            title: 'PRD Plan',
            kind: 'prd',
            version: 1,
          },
          {
            artifactId: '20000000-0000-4000-8000-000000000001',
            versionId: '20000000-0000-4000-8000-000000000002',
            mode: 'revise',
            position: 1,
            title: 'Checklist',
            kind: 'checklist',
            version: 2,
          },
        ],
        generationRuns: [],
      },
    ])
    expect(hydrated).toHaveLength(1)
    expect(hydrated[0].artifactMentions).toHaveLength(2)
    expect(hydrated[0].artifactMentions?.[0].title).toBe('PRD Plan')
    expect(hydrated[0].artifactMentions?.[0].mode).toBe('context')
    expect(hydrated[0].artifactMentions?.[1].title).toBe('Checklist')
    expect(hydrated[0].artifactMentions?.[1].mode).toBe('revise')
  })
})
