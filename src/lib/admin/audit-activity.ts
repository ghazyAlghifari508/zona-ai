import {
  type AuditLogMetadata,
  type AuditLogValue,
  getActorSnapshot,
  getTargetSnapshot,
  safeTechnicalMetadata,
} from './audit-metadata'
import { formatFeedbackStatus } from './presentation'

export const AUDIT_ACTION_CODES = [
  'model.enable',
  'model.disable',
  'model.create',
  'model.update',
  'model.delete',
  'model.connection_test',
  'user.ban',
  'user.unban',
  'user.delete',
  'credit.adjust',
  'credit.reset',
  'feedback.status_update',
] as const

export type AuditActionCode = (typeof AUDIT_ACTION_CODES)[number]

export type AuditActionFilterValue = 'all' | AuditActionCode

const actionLabels: Record<AuditActionCode, string> = {
  'model.enable': 'Mengaktifkan model',
  'model.disable': 'Menonaktifkan model',
  'model.create': 'Menambahkan model',
  'model.update': 'Mengubah informasi model',
  'model.delete': 'Menghapus model',
  'model.connection_test': 'Memeriksa koneksi model',
  'user.ban': 'Memblokir pengguna',
  'user.unban': 'Membuka blokir pengguna',
  'user.delete': 'Menghapus pengguna',
  'credit.adjust': 'Menyesuaikan kredit',
  'credit.reset': 'Reset kredit (development)',
  'feedback.status_update': 'Memperbarui status feedback',
}

const UNKNOWN_ACTION_LABEL = 'Aktivitas lainnya'
const UNKNOWN_TARGET_LABEL = 'Nama tidak tersedia'
const UNKNOWN_ACTOR_LABEL = 'Administrator tidak tersedia'
const NOT_RECORDED = 'Tidak tercatat'

export const AUDIT_ACTION_FILTER_OPTIONS: ReadonlyArray<{
  value: AuditActionFilterValue
  label: string
}> = [
  { value: 'all', label: 'Semua aktivitas' },
  ...AUDIT_ACTION_CODES.map((code) => ({
    value: code,
    label: actionLabels[code],
  })),
]

export function isKnownAuditAction(action: string): action is AuditActionCode {
  return (AUDIT_ACTION_CODES as readonly string[]).includes(action)
}

export function getAuditActionLabel(action: string): string {
  return isKnownAuditAction(action)
    ? actionLabels[action]
    : UNKNOWN_ACTION_LABEL
}

function readString(value: AuditLogValue | undefined): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

function readNumber(value: AuditLogValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatStatus(value: AuditLogValue | undefined): string | null {
  const raw = readString(value)
  if (raw === null) return null
  if (raw === 'active' || raw === 'enabled') return 'Aktif'
  if (raw === 'inactive' || raw === 'disabled') return 'Nonaktif'
  if (raw === 'banned') return 'Diblokir'
  if (
    raw === 'new' ||
    raw === 'in_progress' ||
    raw === 'resolved' ||
    raw === 'rejected'
  ) {
    return formatFeedbackStatus(raw)
  }
  return null
}

function formatDelta(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

export interface AuditActivityDetail {
  label: string
  value: string
}

export interface AuditActivityPresentation {
  actionLabel: string
  actorLabel: string
  actorSource: 'snapshot' | 'current' | 'email' | 'id' | 'fallback'
  targetLabel: string
  targetSource: 'snapshot' | 'legacy' | 'current' | 'fallback'
  details: AuditActivityDetail[]
  technical: Record<string, AuditLogValue>
}

export interface AuditActivityInput {
  action: string
  metadata: AuditLogMetadata
  metadataUnreadable?: boolean | null
  adminId: string | null
  adminEmail: string
  currentActorName: string | null
  targetId: string
  targetType: string
  currentTargetName: string | null
}

function detail(label: string, value: string | null): AuditActivityDetail {
  return { label, value: value ?? NOT_RECORDED }
}

function resolveActor(input: AuditActivityInput): {
  label: string
  source: AuditActivityPresentation['actorSource']
} {
  const snapshot = getActorSnapshot(input.metadata)
  if (snapshot !== null)
    return { label: snapshot.displayName, source: 'snapshot' }
  if (input.currentActorName !== null && input.currentActorName.trim() !== '') {
    return { label: input.currentActorName, source: 'current' }
  }
  if (input.adminEmail.trim() !== '')
    return { label: input.adminEmail, source: 'email' }
  if (input.adminId !== null && input.adminId.trim() !== '') {
    return { label: input.adminId, source: 'id' }
  }
  return { label: UNKNOWN_ACTOR_LABEL, source: 'fallback' }
}

function resolveTarget(input: AuditActivityInput): {
  label: string
  source: AuditActivityPresentation['targetSource']
} {
  const snapshot = getTargetSnapshot(input.metadata)
  if (snapshot !== null)
    return { label: snapshot.displayName, source: 'snapshot' }
  if (input.action === 'user.delete') {
    const deletedName =
      input.metadata === null ? null : readString(input.metadata.deletedName)
    if (deletedName !== null) return { label: deletedName, source: 'legacy' }
  }
  if (
    input.currentTargetName !== null &&
    input.currentTargetName.trim() !== ''
  ) {
    return { label: input.currentTargetName, source: 'current' }
  }
  return { label: UNKNOWN_TARGET_LABEL, source: 'fallback' }
}

function statusDetails(metadata: AuditLogMetadata): AuditActivityDetail[] {
  const reason =
    metadata === null
      ? null
      : (readString(metadata.reason) ?? readString(metadata.disabledReason))
  return [
    detail('Status sebelumnya', formatStatus(metadata?.previousStatus)),
    detail('Status sesudah', formatStatus(metadata?.status)),
    detail('Alasan', reason),
  ]
}

function creditDetails(
  action: AuditActionCode,
  metadata: AuditLogMetadata,
): AuditActivityDetail[] {
  const oldBalance = metadata === null ? null : readNumber(metadata.oldBalance)
  const newBalance = metadata === null ? null : readNumber(metadata.newBalance)
  const delta = metadata === null ? null : readNumber(metadata.delta)
  const details: AuditActivityDetail[] = [
    detail('Saldo sebelumnya', oldBalance === null ? null : String(oldBalance)),
    detail('Saldo sesudah', newBalance === null ? null : String(newBalance)),
  ]
  if (action === 'credit.adjust') {
    details.push(
      detail('Perubahan', delta === null ? null : formatDelta(delta)),
    )
  }
  details.push(
    detail('Alasan', metadata === null ? null : readString(metadata.reason)),
  )
  return details
}

function connectionDetails(metadata: AuditLogMetadata): AuditActivityDetail[] {
  const outcome = metadata === null ? null : readString(metadata.outcome)
  let result: string
  if (outcome === 'valid' || outcome === 'success') {
    result = 'Pemeriksaan berhasil'
  } else if (
    outcome === 'auth_failure' ||
    outcome === 'rate_limit' ||
    outcome === 'timeout' ||
    outcome === 'upstream_error' ||
    outcome === 'invalid_response' ||
    outcome === 'connection_error' ||
    outcome === 'failed' ||
    outcome === 'invalid'
  ) {
    result = 'Pemeriksaan gagal'
  } else {
    result = 'Hasil tidak diketahui'
  }
  const httpStatus = metadata === null ? null : readNumber(metadata.httpStatus)
  return [
    detail('Hasil', result),
    detail('Kode respons', httpStatus === null ? null : String(httpStatus)),
  ]
}

function buildDetails(input: AuditActivityInput): AuditActivityDetail[] {
  if (!isKnownAuditAction(input.action)) return []
  if (input.action === 'credit.adjust' || input.action === 'credit.reset') {
    return creditDetails(input.action, input.metadata)
  }
  if (input.action === 'model.connection_test') {
    return connectionDetails(input.metadata)
  }
  if (input.action === 'feedback.status_update') {
    return [
      detail('Status sebelumnya', formatStatus(input.metadata?.previousStatus)),
      detail('Status sesudah', formatStatus(input.metadata?.status)),
    ]
  }
  if (input.action === 'user.ban') {
    const details = statusDetails(input.metadata)
    const expiresAt =
      input.metadata === null ? null : readString(input.metadata.expiresAt)
    details.push(detail('Berlaku sampai', expiresAt))
    return details
  }
  if (
    input.action === 'model.enable' ||
    input.action === 'model.disable' ||
    input.action === 'model.update' ||
    input.action === 'user.unban'
  ) {
    return statusDetails(input.metadata)
  }
  if (input.action === 'user.delete') {
    return [
      detail('Status sebelumnya', formatStatus(input.metadata?.previousStatus)),
      detail('Hasil', 'Akun dihapus'),
    ]
  }
  return []
}

export function presentAuditActivity(
  input: AuditActivityInput,
): AuditActivityPresentation {
  const actor = resolveActor(input)
  const target = resolveTarget(input)
  const note =
    input.metadataUnreadable === true
      ? 'Metadata tidak dapat dibaca'
      : undefined
  return {
    actionLabel: getAuditActionLabel(input.action),
    actorLabel: actor.label,
    actorSource: actor.source,
    targetLabel: target.label,
    targetSource: target.source,
    details: buildDetails(input),
    technical: {
      ...safeTechnicalMetadata(input.metadata, {
        eventCode: input.action,
        targetId: input.targetId,
        targetType: input.targetType,
      }),
      eventCode: input.action,
      targetId: input.targetId,
      targetType: input.targetType,
      ...(note === undefined ? {} : { note }),
    },
  }
}
