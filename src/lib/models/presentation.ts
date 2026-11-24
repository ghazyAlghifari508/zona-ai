import type { ModelCatalogEntry } from './types'

export type ModelAvailability = {
  state: 'ready' | 'inactive' | 'pending' | 'unverified'
  label: string
  reason: string | null
  selectable: boolean
}

const numberFormatter = new Intl.NumberFormat('id-ID')

const CREDIT_TIER_LABELS: Record<string, string> = {
  premium: 'Premium',
  balanced: 'Seimbang',
  economy: 'Ekonomi',
  adaptive: 'Adaptif',
}

export function formatCreditTier(tier: string | null | undefined): string {
  if (!tier) return ''
  return CREDIT_TIER_LABELS[tier] ?? ''
}

export function formatContextWindowTokens(
  tokens: number | null | undefined,
): string {
  return tokens === null || tokens === undefined
    ? '—'
    : `${numberFormatter.format(tokens)} token`
}

export function hasVerifiedVision(entry: ModelCatalogEntry): boolean {
  if (entry.visionStatus === undefined) return entry.capabilities.vision
  return entry.visionStatus === 'supported' && entry.capabilities.vision
}

export function getModelAvailability(
  entry: ModelCatalogEntry,
): ModelAvailability {
  if (entry.isActive === false || entry.status === 'inactive') {
    return {
      state: 'inactive',
      label: 'Tidak tersedia',
      reason: entry.disabledReason ?? null,
      selectable: false,
    }
  }
  if (entry.status === 'retired') {
    return {
      state: 'inactive',
      label: 'Tidak tersedia',
      reason: entry.disabledReason ?? null,
      selectable: false,
    }
  }
  if (entry.evaluationStatus === 'pending') {
    return {
      state: 'pending',
      label: 'Belum dievaluasi',
      reason: null,
      selectable: false,
    }
  }
  if (
    entry.evaluationStatus === 'failed' ||
    entry.evaluationStatus === 'inconclusive' ||
    entry.creditCost === null ||
    entry.creditCost === undefined
  ) {
    return {
      state: 'unverified',
      label: 'Koneksi belum terverifikasi',
      reason: null,
      selectable: false,
    }
  }
  return { state: 'ready', label: 'Aktif', reason: null, selectable: true }
}
