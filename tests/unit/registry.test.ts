import { describe, it, expect } from 'vitest'
import { getAvailableModels, getModelById } from '../../src/lib/models/registry'

describe('registry', () => {
  it('returns 3 enabled models, auto isDefault', () => {
    const models = getAvailableModels()
    expect(models.length).toBe(3)
    expect(models.find((m) => m.id === 'auto')?.isDefault).toBe(true)
  })
  it('getModelById throws ERR-003 for missing', () => {
    expect(() => getModelById('not-exist')).toThrow(/ERR-003/)
  })
  it('creditCost auto {1,4}, gemini 4, gpt 15', () => {
    expect(getModelById('auto').creditCost).toEqual({ min: 1, max: 4 })
    expect(getModelById('gemini-3.7-flash-high').creditCost).toBe(4)
    expect(getModelById('gpt-5.6-sol').creditCost).toBe(15)
  })
})
