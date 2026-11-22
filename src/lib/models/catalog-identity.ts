export type CatalogStatus = 'active' | 'inactive' | 'retired'

export type CatalogEvaluationStatus =
  | 'legacy'
  | 'pending'
  | 'verified'
  | 'failed'
  | 'inconclusive'

export interface CatalogIdentityRow {
  id: string
  routerModelId: string
  displayName: string
  status: CatalogStatus
  evaluationStatus: CatalogEvaluationStatus
  isVirtual: boolean
  capabilities: {
    text: boolean
    vision: boolean
    files: boolean
  }
}

const AUTO_MODEL_ID = 'auto'

export function resolveCatalogIdentity<T extends CatalogIdentityRow>(
  catalog: readonly T[],
  modelId: string,
  aliases: Readonly<Record<string, string>>,
): T | null {
  const trimmed = modelId.trim()
  if (!trimmed) return null
  const canonicalId = aliases[trimmed] ?? trimmed
  return (
    catalog.find((entry) => entry.id === canonicalId) ??
    catalog.find((entry) => entry.routerModelId === canonicalId) ??
    null
  )
}

export function resolveHistoricalCatalogEntry<T extends CatalogIdentityRow>(
  catalog: readonly T[],
  modelId: string,
  aliases?: Readonly<Record<string, string>>,
): T | null {
  return resolveCatalogIdentity(catalog, modelId, aliases ?? {})
}

export function isCatalogEntryEligible(
  entry: CatalogIdentityRow | null | undefined,
): entry is CatalogIdentityRow {
  return (
    entry !== null &&
    entry !== undefined &&
    !entry.isVirtual &&
    entry.status === 'active' &&
    (entry.evaluationStatus === 'legacy' ||
      entry.evaluationStatus === 'verified') &&
    entry.capabilities.text
  )
}

export function reconcileModelPreference(
  catalog: readonly CatalogIdentityRow[],
  currentModelId: string,
  aliases: Readonly<Record<string, string>>,
): string {
  if (!currentModelId || currentModelId === AUTO_MODEL_ID) return AUTO_MODEL_ID
  const entry = resolveCatalogIdentity(catalog, currentModelId, aliases)
  return isCatalogEntryEligible(entry) ? entry.id : AUTO_MODEL_ID
}
