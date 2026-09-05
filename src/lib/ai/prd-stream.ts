export type PrdPhase =
  | 'preparing'
  | 'generating'
  | 'creating_file'
  | 'completed'
  | 'error'

export type PrdSection =
  | 'overview'
  | 'requirements'
  | 'features'
  | 'userflow'
  | 'architecture'
  | 'schema'
  | 'techstack'

export type PrdStreamEvent =
  | { type: 'prd-status'; phase: 'preparing' }
  | { type: 'prd-status'; phase: 'generating'; section?: PrdSection }
  | { type: 'prd-status'; phase: 'creating_file' }
  | { type: 'prd-status'; phase: 'completed' }
  | { type: 'prd-status'; phase: 'error'; message: string }
  | {
      type: 'prd-artifact'
      attachmentId: string
      fileName: string
      fileSize: number
      mimeType: string
    }
  | {
      type: 'prd-done'
      messageId: string
      generationId: string
      conversationId: string
    }

const validPrdTypes = new Set(['prd-status', 'prd-artifact', 'prd-done'])

export function parsePrdStreamEvent(raw: unknown): PrdStreamEvent {
  if (!raw || typeof raw !== 'object')
    throw new Error('Invalid PrdStreamEvent: not an object')
  const r = raw as Record<string, unknown>
  if (
    !r.type ||
    typeof r.type !== 'string' ||
    !validPrdTypes.has(r.type as string)
  )
    throw new Error('Invalid PrdStreamEvent: invalid type')
  return raw as PrdStreamEvent
}

export function encodePrdSseEvent(event: PrdStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}
