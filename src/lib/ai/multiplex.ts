export type BaseEvent = { generationId: string; modelId: string }

export type StreamEvent =
  | (BaseEvent & {
      type: 'generation-start'
      timestamp: number
      resolvedModelId?: string
      routingReason?: string
    })
  | (BaseEvent & { type: 'text-delta'; text: string })
  | (BaseEvent & { type: 'reasoning-start' })
  | (BaseEvent & { type: 'reasoning-delta'; text: string })
  | (BaseEvent & { type: 'tool-call'; toolName: string; args: unknown })
  | (BaseEvent & {
      type: 'source'
      sources: Array<{ title: string; url: string }>
    })
  | (BaseEvent & {
      type: 'usage'
      promptTokens: number
      completionTokens: number
      totalTokens: number
    })
  | (BaseEvent & {
      type: 'generation-finish'
      finishReason: 'stop' | 'length' | 'tool-calls' | 'error' | 'other'
    })
  | (BaseEvent & { type: 'generation-error'; error: string; code: string })

const validTypes = new Set([
  'generation-start',
  'text-delta',
  'reasoning-start',
  'reasoning-delta',
  'tool-call',
  'source',
  'usage',
  'generation-finish',
  'generation-error',
])

export function parseStreamEvent(raw: unknown): StreamEvent {
  if (!raw || typeof raw !== 'object')
    throw new Error('Invalid StreamEvent: not an object')
  const r = raw as Record<string, unknown>
  if (!r.generationId || typeof r.generationId !== 'string')
    throw new Error('Invalid StreamEvent: missing generationId')
  if (!r.modelId || typeof r.modelId !== 'string')
    throw new Error('Invalid StreamEvent: missing modelId')
  if (
    !r.type ||
    typeof r.type !== 'string' ||
    !validTypes.has(r.type as string)
  )
    throw new Error('Invalid StreamEvent: invalid type')
  return raw as StreamEvent
}

export function createMultiplexStream(
  streams: ReadableStream<StreamEvent>[],
): ReadableStream<StreamEvent> {
  const readers = streams.map((stream) => stream.getReader())
  let stopped = false

  const cancelReaders = async () => {
    if (stopped) return
    stopped = true
    await Promise.allSettled(
      readers.map(async (reader) => {
        try {
          await reader.cancel()
        } finally {
          reader.releaseLock()
        }
      }),
    )
  }

  return new ReadableStream<StreamEvent>({
    async start(controller) {
      let doneCount = 0
      try {
        await Promise.all(
          readers.map(async (reader) => {
            while (!stopped) {
              const { done, value } = await reader.read()
              if (done) break
              controller.enqueue(value)
            }
            doneCount += 1
            if (doneCount === readers.length && !stopped) {
              stopped = true
              controller.close()
              readers.forEach((item) => {
                item.releaseLock()
              })
            }
          }),
        )
      } catch (error) {
        await cancelReaders()
        controller.error(error)
      }
    },
    cancel: cancelReaders,
  })
}

export function parseStreamEventLine(line: string): StreamEvent | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const withoutPrefix = trimmed.startsWith('data:')
    ? trimmed.slice(5).trim()
    : trimmed
  if (withoutPrefix === '[DONE]' || withoutPrefix === '') return null
  try {
    const parsed = JSON.parse(withoutPrefix)
    return parseStreamEvent(parsed)
  } catch {
    return null
  }
}

export function toTaggedStream({
  generationId,
  modelId,
  stream,
}: {
  generationId: string
  modelId: string
  stream: ReadableStream<string>
}): ReadableStream<StreamEvent> {
  return new ReadableStream<StreamEvent>({
    async start(controller) {
      controller.enqueue({
        generationId,
        modelId,
        type: 'generation-start',
        timestamp: Date.now(),
      })
      const reader = stream.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue({
            generationId,
            modelId,
            type: 'text-delta',
            text: value,
          })
        }
        controller.enqueue({
          generationId,
          modelId,
          type: 'generation-finish',
          finishReason: 'stop',
        })
      } catch (e) {
        controller.enqueue({
          generationId,
          modelId,
          type: 'generation-error',
          error: (e as Error).message,
          code: 'ERR-001',
        })
      } finally {
        controller.close()
      }
    },
  })
}
