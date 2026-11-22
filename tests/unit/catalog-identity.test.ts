import { describe, expect, it } from 'vitest'
import {
  type CatalogIdentityRow,
  isCatalogEntryEligible,
  reconcileModelPreference,
  resolveCatalogIdentity,
  resolveHistoricalCatalogEntry,
} from '../../src/lib/models/catalog-identity'

const aliases: Record<string, string> = {
  'gpt-5.6-sol': 'cx/gpt-5.6-sol',
  'qwen3.8-flash': 'bai/qwen3.8-flash',
}

function row(
  id: string,
  overrides: Partial<CatalogIdentityRow> = {},
): CatalogIdentityRow {
  return {
    id,
    routerModelId: id,
    displayName: id,
    status: 'active',
    evaluationStatus: 'legacy',
    isVirtual: false,
    capabilities: { text: true, vision: false, files: true },
    ...overrides,
  }
}

const catalog = [
  row('auto', { isVirtual: true }),
  row('cx/gpt-5.6-sol', { displayName: 'GPT 5.6 Sol' }),
  row('bai/qwen3.8-flash'),
  row('cx/gpt-5.5', { status: 'inactive' }),
  row('ag/retired-model', { status: 'retired' }),
  row('cx/pending-model', { evaluationStatus: 'pending' }),
]

describe('exact catalog identity', () => {
  it('resolves canonical ids and exact router routes', () => {
    expect(resolveCatalogIdentity(catalog, 'cx/gpt-5.6-sol', aliases)?.id).toBe(
      'cx/gpt-5.6-sol',
    )
    expect(
      resolveCatalogIdentity(catalog, 'bai/qwen3.8-flash', aliases)?.id,
    ).toBe('bai/qwen3.8-flash')
  })

  it('resolves only explicit legacy aliases', () => {
    expect(resolveCatalogIdentity(catalog, 'gpt-5.6-sol', aliases)?.id).toBe(
      'cx/gpt-5.6-sol',
    )
    expect(resolveCatalogIdentity(catalog, 'qwen3.8-flash', aliases)?.id).toBe(
      'bai/qwen3.8-flash',
    )
  })

  it('never suffix-matches an unknown id', () => {
    expect(resolveCatalogIdentity(catalog, 'gpt-5.5', aliases)).toBeNull()
    expect(resolveCatalogIdentity(catalog, 'sol', aliases)).toBeNull()
    expect(
      resolveCatalogIdentity(catalog, 'other/gpt-5.6-sol', aliases),
    ).toBeNull()
    expect(resolveCatalogIdentity(catalog, 'not-exist', aliases)).toBeNull()
  })

  it('keeps historical labels for retired and inactive rows', () => {
    expect(
      resolveHistoricalCatalogEntry(catalog, 'ag/retired-model')?.status,
    ).toBe('retired')
    expect(resolveHistoricalCatalogEntry(catalog, 'cx/gpt-5.5')?.status).toBe(
      'inactive',
    )
  })

  it('marks only active, evaluated, text-capable physical rows eligible', () => {
    expect(isCatalogEntryEligible(catalog[1])).toBe(true)
    expect(isCatalogEntryEligible(catalog[0])).toBe(false)
    expect(isCatalogEntryEligible(catalog[3])).toBe(false)
    expect(isCatalogEntryEligible(catalog[4])).toBe(false)
    expect(isCatalogEntryEligible(catalog[5])).toBe(false)
  })

  it('reconciles a stale preference only to Auto', () => {
    expect(reconcileModelPreference(catalog, 'cx/gpt-5.6-sol', aliases)).toBe(
      'cx/gpt-5.6-sol',
    )
    expect(reconcileModelPreference(catalog, 'gpt-5.6-sol', aliases)).toBe(
      'cx/gpt-5.6-sol',
    )
    expect(reconcileModelPreference(catalog, 'gpt-5.5', aliases)).toBe('auto')
    expect(reconcileModelPreference(catalog, 'unknown', aliases)).toBe('auto')
    expect(reconcileModelPreference(catalog, 'auto', aliases)).toBe('auto')
  })
})
