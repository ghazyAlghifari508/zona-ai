import { describe, expect, it } from 'vitest'
import {
  createArtifactSseParser,
  encodeArtifactSseEvent,
  parseArtifactStreamEvent,
} from '../../src/lib/ai/artifact-stream'

const GEN_ID = '11111111-1111-4111-8111-111111111111'
const MSG_ID = '22222222-2222-4222-8222-222222222222'
const CONV_ID = '33333333-3333-4333-8333-333333333333'
const ART_ID = '44444444-4444-4444-8444-444444444444'
const MODEL_ID = 'model-internal'
const ROUTER_MODEL_ID = 'router/model'

const IDENTITY = {
  generationId: GEN_ID,
  modelId: MODEL_ID,
  kind: 'prd',
  operation: 'create',
} as const

describe('artifact stream protocol', () => {
  it('parses a full valid event sequence', () => {
    const created = parseArtifactStreamEvent({
      type: 'artifact-created',
      generationId: GEN_ID,
      modelId: MODEL_ID,
      kind: 'agent-skill',
      operation: 'create',
      artifactId: ART_ID,
      versionId: GEN_ID,
      title: 'Skill X',
      version: 1,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      routerModelId: ROUTER_MODEL_ID,
      summary: 'Skill `X` selesai dibuat.',
      artifact: {
        attachmentId: GEN_ID,
        fileName: 'x.md',
        fileSize: 12,
        mimeType: 'text/markdown',
      },
    })
    expect(created.type).toBe('artifact-created')
  })

  it('rejects events with missing generationId, bad kind, or negative size', () => {
    expect(() =>
      parseArtifactStreamEvent({ type: 'artifact-status', phase: 'preparing' }),
    ).toThrow()
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-status',
        generationId: GEN_ID,
        modelId: MODEL_ID,
        kind: 'prd',
        operation: 'create',
        phase: 'generating',
      }),
    ).not.toThrow()
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-created',
        generationId: GEN_ID,
        modelId: MODEL_ID,
        kind: 'agent-skill',
        operation: 'create',
        artifactId: ART_ID,
        versionId: GEN_ID,
        title: 'Skill X',
        version: 1,
        messageId: MSG_ID,
        conversationId: CONV_ID,
        routerModelId: ROUTER_MODEL_ID,
        summary: 's',
        artifact: {
          attachmentId: GEN_ID,
          fileName: 'x.md',
          fileSize: -1,
          mimeType: 'text/markdown',
        },
      }),
    ).toThrow()
  })

  it('rejects terminal regression completed -> generating', () => {
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-done',
        generationId: GEN_ID,
        kind: 'prd',
        status: 'streaming',
        messageId: GEN_ID,
        conversationId: GEN_ID,
      }),
    ).toThrow()
  })

  it('round-trips through the SSE encoder', () => {
    const event = {
      type: 'artifact-status',
      generationId: GEN_ID,
      modelId: MODEL_ID,
      kind: 'agent-skill',
      operation: 'create',
      phase: 'validating',
    } as const
    const line = encodeArtifactSseEvent(event)
    expect(line.startsWith('data: ')).toBe(true)
    expect(line.endsWith('\n\n')).toBe(true)
    expect(parseArtifactStreamEvent(JSON.parse(line.slice(6).trim()))).toEqual(
      event,
    )
  })

  it('rejects status events missing model or operation identity', () => {
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-status',
        generationId: GEN_ID,
        kind: 'prd',
        phase: 'preparing',
      }),
    ).toThrow()
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-status',
        generationId: GEN_ID,
        kind: 'prd',
        operation: 'create',
        phase: 'preparing',
      }),
    ).toThrow()
    expect(() =>
      parseArtifactStreamEvent({ ...IDENTITY, type: 'artifact-status', phase: 'preparing' }),
    ).not.toThrow()
  })

  it('replaces the creating_file and error phases with saving and failed', () => {
    expect(() =>
      parseArtifactStreamEvent({ ...IDENTITY, type: 'artifact-status', phase: 'creating_file' }),
    ).toThrow()
    expect(() =>
      parseArtifactStreamEvent({ ...IDENTITY, type: 'artifact-status', phase: 'error' }),
    ).toThrow()
    for (const phase of ['preparing', 'generating', 'validating', 'saving', 'completed', 'failed'] as const) {
      expect(
        parseArtifactStreamEvent({ ...IDENTITY, type: 'artifact-status', phase }).type,
      ).toBe('artifact-status')
    }
  })

  it('emits cancelled as a real terminal phase instead of an error phase', () => {
    const event = parseArtifactStreamEvent({
      ...IDENTITY,
      type: 'artifact-status',
      phase: 'cancelled',
    })
    expect(event.type).toBe('artifact-status')
    if (event.type !== 'artifact-status') throw new Error('wrong event')
    expect(event.phase).toBe('cancelled')
  })

  it('requires logical artifact and version identity on creation events', () => {
    expect(() =>
      parseArtifactStreamEvent({
        ...IDENTITY,
        type: 'artifact-created',
        summary: 'PRD selesai dibuat.',
        artifact: {
          attachmentId: GEN_ID,
          fileName: 'x.md',
          fileSize: 12,
          mimeType: 'text/markdown',
        },
      }),
    ).toThrow()
    const created = parseArtifactStreamEvent({
      ...IDENTITY,
      type: 'artifact-created',
      artifactId: ART_ID,
      versionId: GEN_ID,
      title: 'Release plan',
      version: 1,
      messageId: MSG_ID,
      conversationId: CONV_ID,
      routerModelId: ROUTER_MODEL_ID,
      summary: 'PRD selesai dibuat.',
      artifact: {
        attachmentId: GEN_ID,
        fileName: 'x.md',
        fileSize: 12,
        mimeType: 'text/markdown',
      },
    })
    expect(created.type).toBe('artifact-created')
    if (created.type !== 'artifact-created') throw new Error('wrong event')
    expect(created.artifactId).toBe(ART_ID)
    expect(created.version).toBe(1)
    expect(created.messageId).toBe(MSG_ID)
    expect(created.conversationId).toBe(CONV_ID)
  })

  it('requires model and operation identity on terminal done events', () => {
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-done',
        generationId: GEN_ID,
        kind: 'prd',
        status: 'completed',
        messageId: MSG_ID,
        conversationId: CONV_ID,
      }),
    ).toThrow()
    expect(() =>
      parseArtifactStreamEvent({
        ...IDENTITY,
        type: 'artifact-done',
        status: 'completed',
        messageId: MSG_ID,
        conversationId: CONV_ID,
      }),
    ).not.toThrow()
  })

  it('buffers partial SSE frames across pushes and reports malformed frames', () => {
    const seen: string[] = []
    const errors: Error[] = []
    const parser = createArtifactSseParser({
      onEvent: (e) => {
        seen.push(e.type)
      },
      onError: (e) => {
        errors.push(e)
      },
    })
    const valid = `data: ${JSON.stringify({ type: 'artifact-status', generationId: GEN_ID, modelId: MODEL_ID, kind: 'prd', operation: 'create', phase: 'preparing' })}`
    parser.push(`${valid.slice(0, 20)}`)
    expect(seen).toEqual([])
    parser.push(`${valid.slice(20)}\n\n`)
    expect(seen).toEqual(['artifact-status'])
    parser.push('data: {broken json}\n\n')
    expect(errors.length).toBe(1)
    expect(seen).toEqual(['artifact-status'])
  })
})
