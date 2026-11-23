import type { ModelCatalogEntry } from './types'

type CreditCost = ModelCatalogEntry['creditCost'] | undefined

export type ModelAvailability = {
  state: 'ready' | 'inactive' | 'pending' | 'unverified'
  label: string
  reason: string | null
  selectable: boolean
}

const numberFormatter = new Intl.NumberFormat('id-ID')

export function formatCreditCost(cost: CreditCost): string {
  if (cost === null || cost === undefined) return ''
  if (typeof cost === 'number') return `${cost} kredit / permintaan`
  if (cost.min === cost.max) return `${cost.min} kredit / permintaan`
  return `${cost.min}–${cost.max} kredit / permintaan`
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

export function getModelRouteLabel(
  entry: ModelCatalogEntry,
  catalog: readonly ModelCatalogEntry[],
): string | null {
  const duplicateNames = new Map<string, number>()
  for (const candidate of catalog) {
    duplicateNames.set(
      candidate.displayName,
      (duplicateNames.get(candidate.displayName) ?? 0) + 1,
    )
  }
  if ((duplicateNames.get(entry.displayName) ?? 0) < 2) return null
  const [route] = entry.id.split('/')
  return route === entry.id ? null : route
}
