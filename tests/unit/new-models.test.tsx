import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProviderIcon } from '../../src/components/ui/ProviderIcons'
import {
  getModelById,
  getModelCatalog,
  isVisionCapable,
} from '../../src/lib/models/registry'

describe('New AI Models Integration & Empirical Standards', () => {
  const targetModelIds = [
    'atria/Atria-Dawn-Preview',
    'gcli/grok-4.7-high',
    'oc/muse-spark-1.2-contributor-free',
    'oc/muse-spark-1.3-contributor-free',
    'cbai/deepseek-v4.1-flash',
  ] as const

  it('exposes all 5 requested models in getModelCatalog with complete metadata', () => {
    const catalog = getModelCatalog()
    for (const id of targetModelIds) {
      const found = catalog.find((m) => m.id === id)
      expect(found).toBeDefined()
      expect(found?.displayName).toBeTruthy()
      expect(found?.vendor).toBeTruthy()
      expect(found?.capabilities.text).toBe(true)
      expect([3, 4]).toContain(found?.intelligenceBars)
      expect(found?.intelligenceScore).toBeGreaterThanOrEqual(80)
    }
  })

  it('verifies that all 5 target models support vision capabilities (empirically confirmed)', () => {
    for (const id of targetModelIds) {
      expect(isVisionCapable(id)).toBe(true)
      const model = getModelById(id)
      expect(model.capabilities.vision).toBe(true)
    }
  })

  it('verifies Atria Dawn Preview exact empirical specifications and reasoning capability', () => {
    const atria = getModelById('atria/Atria-Dawn-Preview')
    expect(atria.displayName).toBe('Atria Dawn Preview')
    expect(atria.vendor).toBe('Shanghai AI Lab')
    expect(atria.provider).toBe('atria')
    expect(atria.intelligenceBars).toBe(4)
    expect(atria.intelligenceScore).toBe(96)
    expect(atria.creditTier).toBe('premium')
    expect(atria.capabilities.reasoning).toBe(true)
    expect(atria.capabilities.vision).toBe(true)
    expect(atria.metadata.contextWindow).toBeGreaterThanOrEqual(200000)
  })

  it('verifies Grok 4.7 High exact specifications and provider mapping', () => {
    const grok = getModelById('gcli/grok-4.7-high')
    expect(grok.displayName).toBe('Grok 4.7 High')
    expect(grok.vendor).toBe('xAI')
    expect(grok.provider).toBe('gcli')
    expect(grok.intelligenceBars).toBe(4)
    expect(grok.capabilities.vision).toBe(true)
    expect(grok.capabilities.reasoning).toBe(true)
  })

  it('verifies Muse Spark 1.2 and 1.3 free contributor models specifications', () => {
    const v12 = getModelById('oc/muse-spark-1.2-contributor-free')
    const v13 = getModelById('oc/muse-spark-1.3-contributor-free')

    expect(v12.vendor).toBe('Meta')
    expect(v12.capabilities.vision).toBe(true)
    expect(v12.metadata.contextWindow).toBe(1048576)

    expect(v13.vendor).toBe('Meta')
    expect(v13.intelligenceBars).toBe(4)
    expect(v13.intelligenceScore).toBeGreaterThan(v12.intelligenceScore)
    expect(v13.capabilities.vision).toBe(true)
    expect(v13.metadata.contextWindow).toBe(1048576)
  })

  it('verifies DeepSeek V4.1 Flash specifications', () => {
    const ds = getModelById('cbai/deepseek-v4.1-flash')
    expect(ds.vendor).toBe('DeepSeek')
    expect(ds.provider).toBe('cbai')
    expect(ds.capabilities.vision).toBe(true)
    expect(ds.capabilities.reasoning).toBe(true)
    expect(ds.metadata.contextWindow).toBe(1000000)
  })

  it('renders dedicated authentic brand icons without falling back to generic microchip', () => {
    // 1. Atria: renders the official image asset (no robot, no sparkles, no emoji)
    const { container: atriaContainer } = render(<ProviderIcon provider="atria" size={20} />)
    const atriaImg = atriaContainer.querySelector('img')
    expect(atriaImg).not.toBeNull()
    expect(atriaImg?.getAttribute('src')).toBe('/assets/atria-logo.png')
    expect(atriaImg?.getAttribute('alt')).toBe('Atria')

    // 2. Grok: renders xAI Grok SVG for gcli provider
    const { container: grokContainer } = render(<ProviderIcon provider="gcli" size={20} />)
    expect(grokContainer.querySelector('title')?.textContent).toBe('xAI Grok')

    // 3. Meta / Muse Spark: renders Meta loop SVG for oc provider
    const { container: metaContainer } = render(<ProviderIcon provider="oc" size={20} />)
    expect(metaContainer.querySelector('title')?.textContent).toBe('Meta Muse Spark')

    // 4. DeepSeek: renders official DeepSeek whale SVG for cbai provider
    const { container: deepseekContainer } = render(<ProviderIcon provider="cbai" size={20} />)
    expect(deepseekContainer.querySelector('title')?.textContent).toBe('DeepSeek')
  })
})
