import { describe, expect, it } from 'vitest'
import { getModelCatalog } from '../../src/lib/models/registry'

describe('getModelCatalog', () => {
  it('exposes only enabled models with exactly the safe public fields', () => {
    const catalog = getModelCatalog()
    expect(catalog.length).toBeGreaterThan(0)
    for (const entry of catalog) {
      expect(Object.keys(entry).sort()).toEqual([
        'capabilities',
        'confidence',
        'creditCost',
        'creditTier',
        'description',
        'disabledReason',
        'displayName',
        'id',
        'intelligenceBars',
        'intelligenceLevel',
        'intelligenceScore',
        'isActive',
        'isDefault',
        'provider',
        'vendor',
      ])
      expect(entry).not.toHaveProperty('routerModelId')
      expect(entry).not.toHaveProperty('routingRules')
      expect([
        'Zona',
        'Google',
        'OpenAI',
        'Anthropic',
        'xAI',
        'Qwen',
        'Xiaomi',
        'Tencent',
        'Zhipu AI',
      ]).toContain(entry.vendor)
      expect([1, 2, 3, 4]).toContain(entry.intelligenceLevel)
      expect([1, 2, 3, 4]).toContain(entry.intelligenceBars)
      expect(entry.intelligenceScore).toBeGreaterThanOrEqual(0)
      expect(entry.intelligenceScore).toBeLessThanOrEqual(100)
      expect(['high', 'medium', 'low']).toContain(entry.confidence)
    }
  })

  it('marks exactly one default model', () => {
    const defaults = getModelCatalog().filter((m) => m.isDefault)
    expect(defaults).toHaveLength(1)
    expect(defaults[0].id).toBe('auto')
  })
})
