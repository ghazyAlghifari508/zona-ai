import { describe, expect, it, vi } from 'vitest'
import type { ArtifactStreamEvent } from '../../src/lib/ai/artifact-stream'
import {
  consumeArtifactEventResponse,
  stopConfirmedCompareGenerations,
  updateArtifactGenerationFromEvent,
} from '../../src/lib/artifacts/compare-stream'

const GEN_A = '11111111-1111-4111-8111-111111111111'
const GEN_B = '22222222-2222-4222-8222-222222222222'
const FAILED_GEN = '99999999-9999-4999-8999-999999999999'
const ARTIFACT_ID = '33333333-3333-4333-8333-333333333333'
const VERSION_ID = '44444444-4444-4444-8444-444444444444'
const MESSAGE_ID = '55555555-5555-4555-8555-555555555555'
const CONVERSATION_ID = '66666666-6666-4666-8666-666666666666'
const ATTACHMENT_ID = '77777777-7777-4777-8777-777777777777'

type Generation = {
  id: string
  modelId: string
  status: string
  serverGenerationId?: string
  phase?: string
  artifactId?: string
  hydrated?: boolean
}

function statusEvent(input: {
  generationId: string
  modelId: string
  phase: 'preparing' | 'generating'
}): ArtifactStreamEvent {
  return {
    type: 'artifact-status',
    generationId: input.generationId,
    modelId: input.modelId,
    kind: 'checklist',
    operation: 'create',
    phase: input.phase,
  }
}

describe('artifact Compare stream state', () => {
  it('binds the first status server ID and routes later events by that ID', () => {
    const initial: Generation[] = [
      { id: 'client-a', modelId: 'model-a', status: 'streaming' },
      { id: 'client-b', modelId: 'model-b', status: 'streaming' },
    ]
    const prepared = updateArtifactGenerationFromEvent(
      initial,
      statusEvent({
        generationId: GEN_A,
        modelId: 'model-a',
        phase: 'preparing',
      }),
      (generation) => ({ ...generation, phase: 'preparing' }),
    )

    expect(prepared[0]).toMatchObject({
      id: GEN_A,
      serverGenerationId: GEN_A,
      phase: 'preparing',
    })

    const generating = updateArtifactGenerationFromEvent(
      prepared,
      statusEvent({
        generationId: GEN_A,
        modelId: 'model-b',
        phase: 'generating',
      }),
      (generation) => ({ ...generation, phase: 'generating' }),
    )

    expect(generating[0]?.phase).toBe('generating')
    expect(generating[1]).toEqual(initial[1])
  })

  it('stops only confirmed server IDs and reports only successful stops', async () => {
    const stop = vi.fn(async (generationId: string) => {
      if (generationId === GEN_A) throw new Error('stop rejected')
    })
    const result = await stopConfirmedCompareGenerations(
      [
        { id: 'client-unbound', modelId: 'model-a', status: 'streaming' },
        {
          id: GEN_A,
          modelId: 'model-b',
          status: 'streaming',
          serverGenerationId: GEN_A,
        },
        {
          id: GEN_B,
          modelId: 'model-c',
          status: 'streaming',
          serverGenerationId: GEN_B,
        },
      ],
      stop,
    )

    expect(stop.mock.calls).toEqual([[GEN_A], [GEN_B]])
    expect(result.stoppedGenerationIds).toEqual([GEN_B])
    expect(result.hasUnstoppedGeneration).toBe(true)
  })

  it('consumes retry responses as artifact events instead of text frames', async () => {
    const events: ArtifactStreamEvent[] = [
      statusEvent({
        generationId: GEN_A,
        modelId: 'model-a',
        phase: 'preparing',
      }),
      {
        type: 'artifact-created',
        generationId: GEN_A,
        modelId: 'model-a',
        kind: 'checklist',
        operation: 'create',
        artifactId: ARTIFACT_ID,
        versionId: VERSION_ID,
        title: 'Release checklist',
        version: 1,
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
        routerModelId: 'router-a',
        summary: 'Created release checklist.',
        artifact: {
          attachmentId: ATTACHMENT_ID,
          fileName: 'release.md',
          fileSize: 128,
          mimeType: 'text/markdown',
        },
      },
      {
        type: 'artifact-done',
        generationId: GEN_A,
        modelId: 'model-a',
        kind: 'checklist',
        operation: 'create',
        status: 'completed',
        messageId: MESSAGE_ID,
        conversationId: CONVERSATION_ID,
      },
    ]
    const encoded = events.map((event) => `data: ${JSON.stringify(event)}\n\n`)
    const encoder = new TextEncoder()
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(encoded[0].slice(0, 19)))
          controller.enqueue(
            encoder.encode(`${encoded[0].slice(19)}${encoded[1]}${encoded[2]}`),
          )
          controller.close()
        },
      }),
    )
    let generations: Generation[] = [
      {
        id: FAILED_GEN,
        serverGenerationId: FAILED_GEN,
        modelId: 'model-a',
        status: 'failed',
      },
    ]

    await consumeArtifactEventResponse(
      response,
      (event) => {
        generations = updateArtifactGenerationFromEvent(
          generations,
          event,
          (generation) => {
            if (event.type === 'artifact-created') {
              return { ...generation, artifactId: event.artifactId }
            }
            if (event.type === 'artifact-done') {
              return { ...generation, status: event.status }
            }
            return generation
          },
          FAILED_GEN,
        )
      },
      async () => {
        generations = generations.map((generation) => ({
          ...generation,
          hydrated: true,
        }))
      },
    )

    expect(generations).toEqual([
      {
        id: GEN_A,
        serverGenerationId: GEN_A,
        modelId: 'model-a',
        status: 'completed',
        artifactId: ARTIFACT_ID,
        hydrated: true,
      },
    ])
  })
})
