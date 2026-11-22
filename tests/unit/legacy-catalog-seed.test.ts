import { describe, expect, it } from 'vitest'
import {
  buildLegacyCatalogSeed,
  LEGACY_IDENTITY_ALIASES,
} from '../../src/lib/models/legacy-seed'

const seed = buildLegacyCatalogSeed()

describe('legacy catalog seed', () => {
  it('contains exactly 25 physical models plus the virtual Auto router', () => {
    expect(seed).toHaveLength(26)
    expect(seed.filter((row) => !row.isVirtual)).toHaveLength(25)
    expect(seed.filter((row) => row.isVirtual).map((row) => row.id)).toEqual([
      'auto',
    ])
  })

  it('uses unique canonical ids and unique exact router routes', () => {
    expect(new Set(seed.map((row) => row.id)).size).toBe(seed.length)
    expect(new Set(seed.map((row) => row.routerModelId)).size).toBe(seed.length)
  })

  it('migrates the two legacy internal ids as explicit aliases, not as routes', () => {
    expect(LEGACY_IDENTITY_ALIASES).toEqual({
      'gpt-5.6-sol': 'cx/gpt-5.6-sol',
      'qwen3.8-flash': 'bai/qwen3.8-flash',
    })
    for (const [alias, canonicalId] of Object.entries(LEGACY_IDENTITY_ALIASES)) {
      expect(seed.some((row) => row.id === alias)).toBe(false)
      expect(seed.find((row) => row.id === canonicalId)?.routerModelId).toBe(
        canonicalId,
      )
    }
  })

  it('keeps same-basename routes distinct', () => {
    const terra = seed.find((row) => row.id === 'cx/gpt-5.6-terra')
    const sol = seed.find((row) => row.id === 'cx/gpt-5.6-sol')
    expect(terra?.routerModelId).toBe('cx/gpt-5.6-terra')
    expect(sol?.routerModelId).toBe('cx/gpt-5.6-sol')
    expect(terra?.routerModelId).not.toBe(sol?.routerModelId)
  })

  it('marks every imported row as legacy evidence, not verified', () => {
    expect(seed.every((row) => row.evaluationStatus === 'legacy')).toBe(true)
    expect(seed.every((row) => row.provenance === 'legacy-registry-2026-09')).toBe(
      true,
    )
  })

  it('derives Auto routing roles from the legacy routing rules', () => {
    const profiles = new Map(
      seed.map((row) => [row.routerModelId, row.routingProfile]),
    )
    expect(profiles.get('ag/gemini-3.7-flash-low')).toBe('lightweight')
    expect(profiles.get('ag/gemini-3.7-flash-high')).toBe('reasoning')
    expect(profiles.get('cx/gpt-5.6-sol')).toBe('coding')
    expect(profiles.get('auto')).toBe('router')
  })

  it('carries search aliases as data instead of a runtime constant list', () => {
    const sol = seed.find((row) => row.id === 'cx/gpt-5.6-sol')
    expect(sol?.searchAliases).toContain('gpt-5.6-sol')
    const luna = seed.find((row) => row.id === 'cx/gpt-5.6-luna')
    expect(luna?.searchAliases).toContain('luna')
  })
})
