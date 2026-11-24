import { z } from 'zod'

export type AuditLogValue =
  | string
  | number
  | boolean
  | null
  | AuditLogValue[]
  | { [key: string]: AuditLogValue }

const auditLogPrimitiveSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

export const auditLogValueSchema: z.ZodType<AuditLogValue> = z.lazy(() =>
  z.union([
    auditLogPrimitiveSchema,
    z.array(auditLogValueSchema),
    z.record(z.string(), auditLogValueSchema),
  ]),
)

export const auditLogMetadataSchema = z
  .record(z.string(), auditLogValueSchema)
  .nullable()

export type AuditLogMetadata = z.infer<typeof auditLogMetadataSchema>

export interface AuditLogMetadataParseResult {
  metadata: AuditLogMetadata
  unreadable: boolean
}

const auditSnapshotSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
})

export type AuditSnapshot = z.infer<typeof auditSnapshotSchema>

export function parseAuditLogMetadataValue(
  raw: unknown,
): AuditLogMetadataParseResult {
  const result = auditLogMetadataSchema.safeParse(raw)
  if (!result.success) {
    return { metadata: null, unreadable: raw !== null && raw !== undefined }
  }
  return { metadata: result.data, unreadable: false }
}

export function readAuditSnapshot(
  metadata: AuditLogMetadata,
  key: 'actorSnapshot' | 'targetSnapshot',
): AuditSnapshot | null {
  if (metadata === null || typeof metadata !== 'object') return null
  const result = auditSnapshotSchema.safeParse(metadata[key])
  return result.success ? result.data : null
}

export function getActorSnapshot(
  metadata: AuditLogMetadata,
): AuditSnapshot | null {
  return readAuditSnapshot(metadata, 'actorSnapshot')
}

export function getTargetSnapshot(
  metadata: AuditLogMetadata,
): AuditSnapshot | null {
  return readAuditSnapshot(metadata, 'targetSnapshot')
}

export interface CreateAuditMetadataInput {
  actor: AuditSnapshot
  target: AuditSnapshot
  details?: Record<string, AuditLogValue>
}

export function createAuditMetadata({
  actor,
  target,
  details,
}: CreateAuditMetadataInput): AuditLogMetadata {
  const metadata: { [key: string]: AuditLogValue } = {
    actorSnapshot: { id: actor.id, displayName: actor.displayName },
    targetSnapshot: { id: target.id, displayName: target.displayName },
  }
  for (const [key, value] of Object.entries(details ?? {})) {
    if (key in metadata) continue
    metadata[key] = value
  }
  return metadata
}

const REDACTED_KEY_PATTERN =
  /^(?:deletedEmail|adminEmail|email|authorization|apiKey|apikey|token|accessToken|refreshToken|secret|password|headers|adminNotes|notes|prompt|message|content|chat|document|raw|body|deletedName)$/i

const SAFE_MAX_STRING_LENGTH = 240
const SAFE_MAX_DEPTH = 6
const SAFE_MAX_ITEMS = 50

function sanitizeSafeValue(value: AuditLogValue, depth: number): AuditLogValue {
  if (typeof value === 'string') {
    return value.length > SAFE_MAX_STRING_LENGTH
      ? `${value.slice(0, SAFE_MAX_STRING_LENGTH)}…`
      : value
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }
  if (depth >= SAFE_MAX_DEPTH) return '[data terlalu dalam]'
  if (Array.isArray(value)) {
    return value
      .slice(0, SAFE_MAX_ITEMS)
      .map((item) => sanitizeSafeValue(item, depth + 1))
  }
  const sanitized: { [key: string]: AuditLogValue } = {}
  for (const [key, item] of Object.entries(value)) {
    if (REDACTED_KEY_PATTERN.test(key)) continue
    sanitized[key] = sanitizeSafeValue(item, depth + 1)
  }
  return sanitized
}

export interface AuditTechnicalContext {
  eventCode: string
  targetId: string
  targetType: string
}

export function safeTechnicalMetadata(
  metadata: AuditLogMetadata,
  context: AuditTechnicalContext,
): Record<string, AuditLogValue> {
  const safe = metadata === null ? {} : sanitizeSafeValue(metadata, 0)
  const fields: { [key: string]: AuditLogValue } =
    typeof safe === 'object' && safe !== null && !Array.isArray(safe)
      ? safe
      : {}
  return {
    ...fields,
    eventCode: context.eventCode,
    targetId: context.targetId,
    targetType: context.targetType,
  }
}
