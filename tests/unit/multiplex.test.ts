import { describe, expect, it } from 'vitest'
import {
  createMultiplexStream,
  parseStreamEvent,
} from '../../src/lib/ai/multiplex'

describe('multiplex', () => {
  it('parses generation-start', () => {
    const e = parseStreamEvent({
      generationId: 'g1',
      modelId: 'a',
      type: 'generation-start',
      timestamp: 1,
    })
    expect(e.type).toBe('generation-start')
  })
  it('parses text-delta', () => {
    const e = parseStreamEvent({
      generationId: 'g1',
      modelId: 'a',
      type: 'text-delta',
      text: 'hi',
    })
    expect((e as unknown as { text: string }).text).toBe('hi')
  })
  it('rejects missing generationId', () => {
    expect(() =>
      parseStreamEvent({ type: 'text-delta', text: 'hi' } as unknown as Record<
        string,
        unknown
      >),
    ).toThrow()
  })
  it('merges 2 streams', async () => {
    const s1 = new ReadableStream({
      start(c) {
        c.enqueue({
          generationId: 'g1',
          modelId: 'a',
          type: 'text-delta',
          text: 'hello ',
        } as unknown as never)
        c.close()
      },
    })
    const s2 = new ReadableStream({
      start(c) {
        c.enqueue({
          generationId: 'g2',
          modelId: 'b',
          type: 'text-delta',
          text: 'world',
        } as unknown as never)
        c.close()
      },
    })
    const merged = createMultiplexStream([
      s1 as unknown as ReadableStream<never>,
      s2 as unknown as ReadableStream<never>,
    ] as unknown as ReadableStream<never>[])
    const reader = merged.getReader()
    const chunks: unknown[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
    }
    expect(chunks.length).toBe(2)
  })
  it('parses generation-finish and generation-error', () => {
    const f = parseStreamEvent({
      generationId: 'g1',
      modelId: 'a',
      type: 'generation-finish',
      finishReason: 'stop',
    })
    expect(f.type).toBe('generation-finish')
    const e = parseStreamEvent({
      generationId: 'g1',
      modelId: 'a',
      type: 'generation-error',
      error: 'fail',
      code: 'ERR-001',
    })
    expect(e.type).toBe('generation-error')
  })
  it('preserves generationId and modelId tagging', () => {
    const e = parseStreamEvent({
      generationId: 'gid-123',
      modelId: 'gpt-5.6-sol',
      type: 'text-delta',
      text: 'delta',
    })
    expect(e.generationId).toBe('gid-123')
    expect(e.modelId).toBe('gpt-5.6-sol')
  })
})
