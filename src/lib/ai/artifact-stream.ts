import { z } from 'zod'
import { ARTIFACT_KINDS } from '../artifacts/contracts'
import { ARTIFACT_TITLE_MAX_LENGTH } from '../utils/constants'

export type { ArtifactKind } from '../chat/skills'

export const ARTIFACT_PHASES = [
  'preparing',
  'generating',
  'validating',
  'saving',
  'completed',
  'failed',
  'cancelled',
] as const

export type ArtifactPhase = (typeof ARTIFACT_PHASES)[number]

export const ARTIFACT_STREAM_OPERATIONS = ['create', 'revise', 'fork'] as const

export type ArtifactStreamOperation =
  (typeof ARTIFACT_STREAM_OPERATIONS)[number]

const generationIdSchema = z.string().uuid()

const artifactDescriptorSchema = z.object({
  attachmentId: z.string().uuid(),
  fileName: z.string().min(1).max(120),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.string().min(1).max(120),
})

export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>

const baseEventSchema = z.object({
  generationId: generationIdSchema,
  modelId: z.string().min(1),
  kind: z.enum(ARTIFACT_KINDS),
  operation: z.enum(ARTIFACT_STREAM_OPERATIONS),
  comparisonRunId: z.string().uuid().optional(),
  sourceArtifactId: z.string().uuid().optional(),
  sourceVersionId: z.string().uuid().optional(),
})

export const artifactStatusEventSchema = baseEventSchema.extend({
  type: z.literal('artifact-status'),
  phase: z.enum(ARTIFACT_PHASES),
  section: z.string().min(1).max(64).optional(),
  message: z.string().min(1).max(500).optional(),
})

export const artifactCreatedEventSchema = baseEventSchema.extend({
  type: z.literal('artifact-created'),
  artifactId: z.string().uuid(),
  versionId: z.string().uuid(),
  title: z.string().trim().min(1).max(ARTIFACT_TITLE_MAX_LENGTH),
  version: z.number().int().positive(),
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  routerModelId: z.string().min(1),
  summary: z.string().min(1).max(2000),
  artifact: artifactDescriptorSchema,
})

export const artifactErrorEventSchema = baseEventSchema.extend({
  type: z.literal('artifact-error'),
  code: z.string().min(1).max(32),
  retryable: z.boolean(),
  message: z.string().min(1).max(500).optional(),
})

export const artifactDoneEventSchema = baseEventSchema.extend({
  type: z.literal('artifact-done'),
  status: z.enum(['completed', 'cancelled', 'failed']),
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
})

export const artifactStreamEventSchema = z.discriminatedUnion('type', [
  artifactStatusEventSchema,
  artifactCreatedEventSchema,
  artifactErrorEventSchema,
  artifactDoneEventSchema,
])

export type ArtifactStreamEvent = z.infer<typeof artifactStreamEventSchema>

export function parseArtifactStreamEvent(raw: unknown): ArtifactStreamEvent {
  return artifactStreamEventSchema.parse(raw)
}

export function encodeArtifactSseEvent(event: ArtifactStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

export function createArtifactSseParser(handlers: {
  onEvent: (event: ArtifactStreamEvent) => void
  onError: (error: Error) => void
}): { push(chunk: string): void; flush(): void } {
  let buffer = ''
  const handleFrame = (frame: string) => {
    const dataLines = frame
      .split('\n')
      .filter((line) => line.startsWith('data:'))
    if (dataLines.length === 0) return
    const payload = dataLines.map((line) => line.slice(5).trim()).join('\n')
    if (!payload || payload === '[DONE]') return
    try {
      handlers.onEvent(parseArtifactStreamEvent(JSON.parse(payload)))
    } catch (err) {
      handlers.onError(
        err instanceof Error ? err : new Error('Invalid artifact event'),
      )
    }
  }
  return {
    push(chunk: string) {
      buffer += chunk
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''
      for (const part of parts) handleFrame(part)
    },
    flush() {
      if (buffer.trim()) handleFrame(buffer)
      buffer = ''
    },
  }
}
