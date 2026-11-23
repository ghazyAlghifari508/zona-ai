import { selectAutoCandidate } from './auto-policy'
import type { CatalogSeedRow } from './catalog-contract'
import { isCatalogEntryEligible } from './catalog-identity'
import { inspectP3Scope, p3Manifest } from './p3-manifest'

export function planP3Cutover(rows: readonly CatalogSeedRow[]) {
  const retire = p3Manifest.retire.map(({ routerModelId }) => {
    const row = rows.find(
      (item) =>
        item.id === routerModelId &&
        item.routerModelId === routerModelId &&
        !item.isVirtual,
    )
    if (!row) throw new Error(`Missing legacy identity: ${routerModelId}`)
    return row
  })
  const retireIds = new Set(retire.map((row) => row.id))
  const final = rows.filter(
    (row) => row.status !== 'retired' && !retireIds.has(row.id),
  )
  const scope = inspectP3Scope(final)
  const differences = [...scope.missing, ...scope.drift, ...scope.conflicts]
  if (differences.length)
    throw new Error(`P3 catalog scope mismatch: ${differences.join(', ')}`)
  if (
    !final.some(
      (row) => row.id === 'auto' && row.isVirtual && row.status === 'active',
    )
  )
    throw new Error('Auto identity unavailable')
  const candidates = final
    .filter(
      (row) =>
        row.evaluationStatus === 'verified' && isCatalogEntryEligible(row),
    )
    .map((row) => ({
      id: row.id,
      routerModelId: row.routerModelId,
      score: row.intelligenceScore,
      credit: row.creditCostMax,
      tier: row.creditTier,
      profile: row.routingProfile,
      vision: row.visionStatus === 'supported',
      files: row.capabilities.files,
    }))
  if (
    !candidates.some((row) =>
      p3Manifest.added.some(
        (entry) => entry.routerModelId === row.routerModelId,
      ),
    )
  )
    throw new Error('No verified active new route')
  const credits = Math.min(...candidates.map((row) => row.credit))
  if (
    !selectAutoCandidate({ prompt: 'Hello', credits, candidates }) ||
    !selectAutoCandidate({ prompt: '', purpose: 'title', candidates })
  )
    throw new Error(
      'Retirement would leave Auto or title without a verified candidate',
    )
  return { retire: retire.filter((row) => row.status !== 'retired'), final }
}
