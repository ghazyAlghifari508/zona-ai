import { describe, expect, it } from 'vitest'
import { getAvailableModels, getModelById } from '../../src/lib/models/registry'

describe('registry', () => {
  it('returns 21 enabled models, auto isDefault', () => {
    const models = getAvailableModels()
    expect(models.length).toBe(21)
    expect(models.find((m) => m.id === 'auto')?.isDefault).toBe(true)
  })
  it('getModelById throws ERR-003 for missing', () => {
    expect(() => getModelById('not-exist')).toThrow(/ERR-003/)
  })
  it('creditCost auto {1,4}, gemini 6, gpt 15, qwen 3, mimo 3, hy3 6, glm 6', () => {
    expect(getModelById('auto').creditCost).toEqual({ min: 1, max: 4 })
    expect(getModelById('gemini-3.7-flash-high').creditCost).toBe(6)
    expect(getModelById('gpt-5.6-sol').creditCost).toBe(15)
    expect(getModelById('qwen3.8-flash').creditCost).toBe(3)
    expect(getModelById('mimo-v2.5').creditCost).toBe(3)
    expect(getModelById('hy3').creditCost).toBe(6)
    expect(getModelById('glm-5.3-flash').creditCost).toBe(6)
  })
  it('maps correct 9router model IDs', () => {
    expect(getModelById('mimo-v2.5').routerModelId).toBe('bai/mimo-v2.5')
    expect(getModelById('hy3').routerModelId).toBe('bai/hy3')
    expect(getModelById('glm-5.3-flash').routerModelId).toBe(
      'bai/glm-5.3-flash',
    )
    expect(getModelById('gpt-5.6-sol').routerModelId).toBe('cx/gpt-5.6-sol')
    expect(getModelById('gemini-3.7-flash-high').routerModelId).toBe(
      'ag/gemini-3.7-flash-high',
    )
    expect(getModelById('qwen3.8-flash').routerModelId).toBe(
      'bai/qwen3.8-flash',
    )
  })
  it('verifies capabilities for new models', () => {
    const mimo = getModelById('mimo-v2.5')
    expect(mimo.capabilities.vision).toBe(true)
    expect(mimo.capabilities.reasoning).toBe(false)
    expect(mimo.capabilities.tools).toBe(true)
    expect(mimo.capabilities.structuredOutput).toBe(true)

    const hy3 = getModelById('hy3')
    expect(hy3.capabilities.vision).toBe(false)
    expect(hy3.capabilities.reasoning).toBe(true)
    expect(hy3.capabilities.tools).toBe(true)
    expect(hy3.capabilities.structuredOutput).toBe(true)

    const glm = getModelById('glm-5.3-flash')
    expect(glm.capabilities.vision).toBe(true)
    expect(glm.capabilities.reasoning).toBe(true)
    expect(glm.capabilities.tools).toBe(true)
    expect(glm.capabilities.structuredOutput).toBe(true)

    const qwen = getModelById('qwen3.8-flash')
    expect(qwen.capabilities.vision).toBe(false)
    expect(qwen.capabilities.reasoning).toBe(true)

    const gpt = getModelById('gpt-5.6-sol')
    expect(gpt.capabilities.vision).toBe(true)
    expect(gpt.capabilities.reasoning).toBe(true)

    const gemini = getModelById('gemini-3.7-flash-high')
    expect(gemini.capabilities.vision).toBe(true)
    expect(gemini.capabilities.reasoning).toBe(true)
  })

  it('assigns researched intelligence scores and normalized bars', () => {
    expect(getModelById('gpt-5.6-sol').intelligenceScore).toBe(96)
    expect(getModelById('gpt-5.6-sol').intelligenceBars).toBe(4)

    expect(getModelById('gemini-3.7-flash-high').intelligenceScore).toBe(88)
    expect(getModelById('gemini-3.7-flash-high').intelligenceBars).toBe(3)

    expect(getModelById('glm-5.3-flash').intelligenceScore).toBe(81)
    expect(getModelById('glm-5.3-flash').intelligenceBars).toBe(3)

    expect(getModelById('hy3').intelligenceScore).toBe(78)
    expect(getModelById('hy3').intelligenceBars).toBe(3)

    expect(getModelById('qwen3.8-flash').intelligenceScore).toBe(72)
    expect(getModelById('qwen3.8-flash').intelligenceBars).toBe(2)

    expect(getModelById('mimo-v2.5').intelligenceScore).toBe(64)
    expect(getModelById('mimo-v2.5').intelligenceBars).toBe(2)

    // New frontier models verification
    expect(getModelById('cx/gpt-5.6-terra').intelligenceScore).toBe(98)
    expect(getModelById('cx/gpt-5.6-terra').intelligenceBars).toBe(4)
    expect(getModelById('cx/gpt-5.6-terra').vendor).toBe('OpenAI')

    expect(
      getModelById('ag/gemini-3.8-flash-high').intelligenceScore,
    ).toBe(92)
    expect(
      getModelById('ag/gemini-3.8-flash-high').intelligenceBars,
    ).toBe(4)
    expect(getModelById('ag/gemini-3.8-flash-high').vendor).toBe('Google')

    expect(getModelById('ag/claude-opus-4-6-thinking').intelligenceScore).toBe(
      97,
    )
    expect(getModelById('ag/claude-opus-4-6-thinking').intelligenceBars).toBe(4)
    expect(getModelById('ag/claude-opus-4-6-thinking').vendor).toBe('Anthropic')

    expect(getModelById('gcli/grok-4.6').intelligenceScore).toBe(94)
    expect(getModelById('gcli/grok-4.6').intelligenceBars).toBe(4)
    expect(getModelById('gcli/grok-4.6').vendor).toBe('xAI')

    expect(getModelById('ag/claude-sonnet-4-6').intelligenceScore).toBe(90)
    expect(getModelById('ag/claude-sonnet-4-6').intelligenceBars).toBe(3)

    expect(getModelById('cx/gpt-5.5').intelligenceScore).toBe(89)
    expect(getModelById('cx/gpt-5.5').intelligenceBars).toBe(3)

    expect(getModelById('gcli/grok-4.5').intelligenceScore).toBe(86)
    expect(getModelById('gcli/grok-4.5').intelligenceBars).toBe(3)

    expect(getModelById('ag/gemini-3.6-flash-high').intelligenceScore).toBe(82)
    expect(getModelById('ag/gemini-3.6-flash-high').intelligenceBars).toBe(3)

    expect(getModelById('gh/gpt-4.1').intelligenceScore).toBe(74)
    expect(getModelById('gh/gpt-4.1').intelligenceBars).toBe(2)

    expect(getModelById('ag/gemini-pro-agent').intelligenceScore).toBe(73)
    expect(getModelById('ag/gemini-pro-agent').intelligenceBars).toBe(2)

    expect(getModelById('gh/gpt-4o').intelligenceScore).toBe(70)
    expect(getModelById('gh/gpt-4o').intelligenceBars).toBe(2)
  })
})
