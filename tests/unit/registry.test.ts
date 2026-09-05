import { describe, expect, it } from 'vitest'
import { getAvailableModels, getModelById } from '../../src/lib/models/registry'

describe('registry', () => {
  it('returns 7 enabled models, auto isDefault', () => {
    const models = getAvailableModels()
    expect(models.length).toBe(7)
    expect(models.find((m) => m.id === 'auto')?.isDefault).toBe(true)
  })
  it('getModelById throws ERR-003 for missing', () => {
    expect(() => getModelById('not-exist')).toThrow(/ERR-003/)
  })
  it('creditCost auto {1,4}, gemini 4, gpt 15, qwen 3, mimo 3, hy3 3, glm 3', () => {
    expect(getModelById('auto').creditCost).toEqual({ min: 1, max: 4 })
    expect(getModelById('gemini-3.7-flash-high').creditCost).toBe(4)
    expect(getModelById('gpt-5.6-sol').creditCost).toBe(15)
    expect(getModelById('qwen3.8-flash').creditCost).toBe(3)
    expect(getModelById('mimo-v2.5').creditCost).toBe(3)
    expect(getModelById('hy3').creditCost).toBe(3)
    expect(getModelById('glm-5.3-flash').creditCost).toBe(3)
  })
  it('maps correct 9router model IDs', () => {
    expect(getModelById('mimo-v2.5').routerModelId).toBe('bai/mimo-v2.5')
    expect(getModelById('hy3').routerModelId).toBe('bai/hy3')
    expect(getModelById('glm-5.3-flash').routerModelId).toBe('bai/glm-5.3-flash')
    expect(getModelById('gpt-5.6-sol').routerModelId).toBe('cx/gpt-5.6-sol')
    expect(getModelById('gemini-3.7-flash-high').routerModelId).toBe(
      'ag/gemini-3.7-flash-high',
    )
    expect(getModelById('qwen3.8-flash').routerModelId).toBe('bai/qwen3.8-flash')
  })
  it('verifies capabilities for new models', () => {
    const mimo = getModelById('mimo-v2.5')
    expect(mimo.capabilities.vision).toBe(true)
    expect(mimo.capabilities.reasoning).toBe(false)
    expect(mimo.capabilities.tools).toBe(true)

    const hy3 = getModelById('hy3')
    expect(hy3.capabilities.vision).toBe(false)
    expect(hy3.capabilities.reasoning).toBe(true)
    expect(hy3.capabilities.tools).toBe(true)

    const glm = getModelById('glm-5.3-flash')
    expect(glm.capabilities.vision).toBe(true)
    expect(glm.capabilities.reasoning).toBe(true)
    expect(glm.capabilities.tools).toBe(true)
  })
})
