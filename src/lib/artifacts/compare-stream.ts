import {
  type ArtifactStreamEvent,
  createArtifactSseParser,
} from '../ai/artifact-stream'

type ArtifactCompareGeneration = {
  id: string
  modelId: string
  status: string
  serverGenerationId?: string
}

export function updateArtifactGenerationFromEvent<
  T extends ArtifactCompareGeneration,
>(
  generations: T[],
  event: Pick<ArtifactStreamEvent, 'generationId' | 'modelId'>,
  update: (generation: T) => T,
  pendingGenerationId?: string,
): T[] {
  const serverMatchIndex = generations.findIndex(
    (generation) => generation.serverGenerationId === event.generationId,
  )
  const pendingMatchIndex = pendingGenerationId
    ? generations.findIndex(
        (generation) =>
          generation.id === pendingGenerationId ||
          generation.serverGenerationId === pendingGenerationId,
      )
    : -1
  const unboundModelMatchIndex = generations.findIndex(
    (generation) =>
      generation.serverGenerationId === undefined &&
      generation.modelId === event.modelId,
  )
  const matchIndex =
    serverMatchIndex !== -1
      ? serverMatchIndex
      : pendingMatchIndex !== -1
        ? pendingMatchIndex
        : unboundModelMatchIndex

  if (matchIndex === -1) return generations

  return generations.map((generation, index) =>
    index === matchIndex
      ? update({
          ...generation,
          id: event.generationId,
          serverGenerationId: event.generationId,
        })
      : generation,
  )
}

export async function stopConfirmedCompareGenerations<
  T extends ArtifactCompareGeneration,
>(
  generations: T[],
  stop: (generationId: string) => Promise<unknown>,
): Promise<{
  stoppedGenerationIds: string[]
  hasUnstoppedGeneration: boolean
}> {
  const streaming = generations.filter(
    (generation) => generation.status === 'streaming',
  )
  const stoppedGenerationIds: string[] = []

  for (const generation of streaming) {
    if (!generation.serverGenerationId) continue
    try {
      await stop(generation.serverGenerationId)
      stoppedGenerationIds.push(generation.serverGenerationId)
    } catch {}
  }

  const stopped = new Set(stoppedGenerationIds)
  return {
    stoppedGenerationIds,
    hasUnstoppedGeneration: streaming.some(
      (generation) =>
        !generation.serverGenerationId ||
        !stopped.has(generation.serverGenerationId),
    ),
  }
}

export async function consumeArtifactEventResponse(
  response: Response,
  onEvent: (event: ArtifactStreamEvent) => void,
  onComplete: () => Promise<void>,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Artifact comparison stream is unavailable.')

  let parserError: Error | null = null
  const parser = createArtifactSseParser({
    onEvent,
    onError: (error) => {
      parserError = error
    },
  })
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parser.push(decoder.decode(value, { stream: true }))
    if (parserError) throw parserError
  }
  parser.push(decoder.decode())
  parser.flush()
  if (parserError) throw parserError
  await onComplete()
}
