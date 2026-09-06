import { describe, expect, it } from 'vitest'
import {
  createArtifactSseParser,
  encodeArtifactSseEvent,
  parseArtifactStreamEvent,
} from '../../src/lib/ai/artifact-stream'

const GEN_ID = '11111111-1111-4111-8111-111111111111'

describe('artifact stream protocol', () => {
  it('parses a full valid event sequence', () => {
    const created = parseArtifactStreamEvent({
      type: 'artifact-created',
      generationId: GEN_ID,
      kind: 'agent-skill',
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
        kind: 'prd',
        phase: 'generating',
      }),
    ).not.toThrow()
    expect(() =>
      parseArtifactStreamEvent({
        type: 'artifact-created',
        generationId: GEN_ID,
        kind: 'agent-skill',
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
      kind: 'agent-skill',
      phase: 'validating',
    } as const
    const line = encodeArtifactSseEvent(event)
    expect(line.startsWith('data: ')).toBe(true)
    expect(line.endsWith('\n\n')).toBe(true)
    expect(parseArtifactStreamEvent(JSON.parse(line.slice(6).trim()))).toEqual(
      event,
    )
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
    const valid = `data: ${JSON.stringify({ type: 'artifact-status', generationId: GEN_ID, kind: 'prd', phase: 'preparing' })}`
    parser.push(`${valid.slice(0, 20)}`)
    expect(seen).toEqual([])
    parser.push(`${valid.slice(20)}\n\n`)
    expect(seen).toEqual(['artifact-status'])
    parser.push('data: {broken json}\n\n')
    expect(errors.length).toBe(1)
    expect(seen).toEqual(['artifact-status'])
  })
})
