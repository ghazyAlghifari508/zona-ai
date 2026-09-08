/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { multiplexArtifactResponses } from '../../src/server/core/artifact-generation'

const GEN_ID = '11111111-1111-4111-8111-111111111111'
const MSG_ID = '22222222-2222-4222-8222-222222222222'
const CONV_ID = '33333333-3333-4333-8333-333333333333'
const MODEL_ID = 'model-internal'
const ROUTER_MODEL_ID = 'router/model'

describe('artifact multiplex streaming', () => {
  it('streams single-worker preparing before the full body completes', async () => {
    const encoder = new TextEncoder()
    const decoder = new TextDecoder()
    const preparing = {
      type: 'artifact-status',
      generationId: GEN_ID,
      modelId: MODEL_ID,
      kind: 'prd',
      operation: 'create',
      phase: 'preparing',
    } as const
    const done = {
      type: 'artifact-done',
      generationId: GEN_ID,
      modelId: MODEL_ID,
      kind: 'prd',
      operation: 'create',
      status: 'completed',
      messageId: MSG_ID,
      conversationId: CONV_ID,
    } as const
    let releaseGate: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const source = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(preparing)}\n\n`),
        )
        await gate
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(done)}\n\n`))
        controller.close()
      },
    })
    const workerRes = new Response(source, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'X-Generation-Id': GEN_ID,
        'X-Conversation-Id': CONV_ID,
        'X-Artifact-Kind': 'prd',
        'X-Router-Model-Id': ROUTER_MODEL_ID,
      },
    })
    const merged = await multiplexArtifactResponses([workerRes], CONV_ID)
    const reader = merged.body?.getReader()
    expect(reader).toBeDefined()
    if (!reader) throw new Error('missing merged body')
    const pending = reader.read()
    const outcome = await Promise.race([
      pending.then(() => 'event' as const),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 200),
      ),
    ])
    releaseGate()
    expect(outcome).toBe('event')
    const first = await pending
    expect(first.done).toBe(false)
    const firstText =
      first.value instanceof Uint8Array
        ? decoder.decode(first.value)
        : String(first.value ?? '')
    expect(firstText).toContain('preparing')
    let tail = ''
    while (true) {
      const next = await reader.read()
      if (next.done) break
      tail +=
        next.value instanceof Uint8Array
          ? decoder.decode(next.value, { stream: true })
          : String(next.value ?? '')
    }
    tail += decoder.decode()
    expect(`${firstText}${tail}`).toContain('artifact-done')
  })
})
