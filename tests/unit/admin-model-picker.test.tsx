import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompareGrid } from '../../src/components/chat/CompareGrid'
import { ModelSelector } from '../../src/components/chat/ModelSelector'
import {
  clearModelCatalogCache,
  loadModelCatalog,
  mergeModelSettings,
} from '../../src/components/chat/useModelCatalog'
import type { ModelCatalogEntry } from '../../src/lib/models/types'

const mockCatalog: ModelCatalogEntry[] = [
  {
    id: 'auto',
    displayName: 'Auto',
    provider: 'zona-router',
    vendor: 'Zona',
    intelligenceLevel: 3,
    intelligenceScore: 88,
    intelligenceBars: 3,
    confidence: 'high',
    description: 'Dynamic smart router',
    isDefault: true,
    creditTier: 'adaptive',
    creditCost: { min: 1, max: 4 },
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
      structuredOutput: true,
    },
    isActive: true,
    disabledReason: null,
  },
  {
    id: 'cx/gpt-5.6-sol',
    displayName: 'GPT 5.6 Sol',
    provider: 'codex',
    vendor: 'OpenAI',
    intelligenceLevel: 4,
    intelligenceScore: 96,
    intelligenceBars: 4,
    confidence: 'high',
    description: 'Flagship frontier reasoning model',
    isDefault: false,
    creditTier: 'premium',
    creditCost: 4,
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
      structuredOutput: true,
    },
    isActive: false,
    disabledReason: 'Pemeliharaan sistem OpenAI',
  },
  {
    id: 'ag/gemini-3.7-flash-high',
    displayName: 'Gemini 3.7 Flash',
    provider: 'antigravity',
    vendor: 'Google',
    intelligenceLevel: 3,
    intelligenceScore: 88,
    intelligenceBars: 3,
    confidence: 'high',
    description: 'Next-gen hybrid reasoning',
    isDefault: false,
    creditTier: 'balanced',
    creditCost: 2,
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
      structuredOutput: true,
    },
    isActive: true,
    disabledReason: null,
  },
]

vi.mock('../../src/server/functions/models', () => ({
  getModelCatalog: vi.fn(async () => [
    {
      id: 'cx/gpt-5.6-sol',
      displayName: 'GPT 5.6 Sol',
      provider: 'codex',
      vendor: 'OpenAI',
      intelligenceLevel: 4,
      intelligenceScore: 96,
      intelligenceBars: 4,
      confidence: 'high',
      description: 'OpenAI model',
      isDefault: false,
      creditTier: 'premium',
      creditCost: 4,
      capabilities: {
        text: true,
        vision: true,
        files: true,
        tools: true,
        reasoning: true,
        structuredOutput: true,
      },
    },
  ]),
}))

vi.mock('../../src/components/chat/useModelCatalog', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/components/chat/useModelCatalog')
    >()
  return {
    ...actual,
    useModelCatalog: vi.fn(() => mockCatalog),
  }
})

describe('Model Catalog Entry & mergeModelSettings', () => {
  it('supports isActive and disabledReason in ModelCatalogEntry', () => {
    const entry: ModelCatalogEntry = {
      id: 'test-model',
      displayName: 'Test Model',
      provider: 'test-provider',
      vendor: 'Test Vendor',
      intelligenceLevel: 2,
      intelligenceScore: 70,
      intelligenceBars: 2,
      confidence: 'medium',
      description: 'Test description',
      isDefault: false,
      creditTier: 'balanced',
      creditCost: 2,
      capabilities: {
        text: true,
        vision: false,
        files: false,
        tools: false,
        reasoning: false,
        structuredOutput: false,
      },
      isActive: false,
      disabledReason: 'Under maintenance',
    }

    expect(entry.isActive).toBe(false)
    expect(entry.disabledReason).toBe('Under maintenance')
  })

  it('merges model settings into catalog entries and defaults isActive to true', () => {
    const rawEntries: ModelCatalogEntry[] = [
      {
        id: 'cx/gpt-5.6-sol',
        displayName: 'GPT 5.6 Sol',
        provider: 'codex',
        vendor: 'OpenAI',
        intelligenceLevel: 4,
        intelligenceScore: 96,
        intelligenceBars: 4,
        confidence: 'high',
        description: 'OpenAI model',
        isDefault: false,
        creditTier: 'premium',
        creditCost: 4,
        capabilities: {
          text: true,
          vision: true,
          files: true,
          tools: true,
          reasoning: true,
          structuredOutput: true,
        },
      },
      {
        id: 'ag/gemini-3.7-flash-high',
        displayName: 'Gemini 3.7 Flash',
        provider: 'antigravity',
        vendor: 'Google',
        intelligenceLevel: 3,
        intelligenceScore: 88,
        intelligenceBars: 3,
        confidence: 'high',
        description: 'Google model',
        isDefault: false,
        creditTier: 'balanced',
        creditCost: 2,
        capabilities: {
          text: true,
          vision: true,
          files: true,
          tools: true,
          reasoning: true,
          structuredOutput: true,
        },
      },
    ]

    const settings = [
      {
        modelId: 'gpt-5.6-sol',
        isActive: false,
        disabledReason: 'Sedang offline untuk perbaikan',
      },
    ]

    const merged = mergeModelSettings(rawEntries, settings)

    const gpt = merged.find((m) => m.id === 'cx/gpt-5.6-sol')
    expect(gpt).toBeDefined()
    expect(gpt?.isActive).toBe(false)
    expect(gpt?.disabledReason).toBe('Sedang offline untuk perbaikan')

    const gemini = merged.find((m) => m.id === 'ag/gemini-3.7-flash-high')
    expect(gemini).toBeDefined()
    expect(gemini?.isActive).toBe(true)
    expect(gemini?.disabledReason).toBeNull()
  })

  it('loadModelCatalog fetches dynamic availability overrides via settingsFetcher and merges them', async () => {
    clearModelCatalogCache()
    const mockSettingsFetcher = vi.fn(async () => [
      {
        modelId: 'cx/gpt-5.6-sol',
        isActive: false,
        disabledReason: 'Maintenance in progress',
      },
    ])

    const catalog = await loadModelCatalog(mockSettingsFetcher)
    expect(mockSettingsFetcher).toHaveBeenCalledTimes(1)
    const gpt = catalog.find(
      (m) => m.id === 'cx/gpt-5.6-sol' || m.id === 'gpt-5.6-sol',
    )
    expect(gpt).toBeDefined()
    expect(gpt?.isActive).toBe(false)
    expect(gpt?.disabledReason).toBe('Maintenance in progress')
  })
})

describe('ModelSelector disabled state', () => {
  afterEach(cleanup)

  it('renders "Sedang tidak tersedia" badge and disabled attribute for inactive model', async () => {
    render(
      <ModelSelector
        value="auto"
        onChange={vi.fn()}
        compareEnabled={false}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={[]}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('model-selector-trigger'))

    await waitFor(() => {
      expect(screen.getByTestId('model-search-input')).toBeTruthy()
    })

    const disabledOption = screen.getByTestId('model-option-cx/gpt-5.6-sol')
    expect(disabledOption).toBeTruthy()
    expect(disabledOption.hasAttribute('disabled')).toBe(true)
    expect(disabledOption.getAttribute('title')).toContain(
      'Pemeliharaan sistem OpenAI',
    )

    expect(
      screen.getByTestId('model-disabled-badge-cx/gpt-5.6-sol'),
    ).toBeTruthy()
    expect(
      screen.getByTestId('model-disabled-badge-cx/gpt-5.6-sol').textContent,
    ).toContain('Sedang tidak tersedia')
  })

  it('prevents selection when clicking a disabled model in single mode', async () => {
    const onChange = vi.fn()
    render(
      <ModelSelector
        value="auto"
        onChange={onChange}
        compareEnabled={false}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={[]}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByTestId('model-selector-trigger'))

    await waitFor(() => {
      expect(screen.getByTestId('model-search-input')).toBeTruthy()
    })

    const disabledOption = screen.getByTestId('model-option-cx/gpt-5.6-sol')
    fireEvent.click(disabledOption)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('prevents selection when clicking a disabled model in compare mode', async () => {
    const onCompareModelIdsChange = vi.fn()
    render(
      <ModelSelector
        value="auto"
        onChange={vi.fn()}
        compareEnabled={true}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={['ag/gemini-3.7-flash-high']}
        onCompareModelIdsChange={onCompareModelIdsChange}
      />,
    )

    fireEvent.click(screen.getByTestId('model-selector-trigger'))

    await waitFor(() => {
      expect(screen.getByTestId('model-search-input')).toBeTruthy()
    })

    const disabledOption = screen.getByTestId('model-option-cx/gpt-5.6-sol')
    fireEvent.click(disabledOption)

    expect(onCompareModelIdsChange).not.toHaveBeenCalled()
  })
})

describe('CompareGrid disabled model integration', () => {
  afterEach(cleanup)

  it('displays "Sedang tidak tersedia" indicator for disabled model column in CompareGrid', () => {
    const generations = [
      {
        id: 'gen-1',
        modelId: 'cx/gpt-5.6-sol',
        status: 'completed',
        content: 'Response from disabled model',
      },
      {
        id: 'gen-2',
        modelId: 'ag/gemini-3.7-flash-high',
        status: 'completed',
        content: 'Response from active model',
      },
    ]

    render(<CompareGrid generations={generations} />)

    expect(screen.getByTestId('compare-disabled-warning')).toBeTruthy()
    expect(
      screen.getByTestId('compare-disabled-warning').textContent,
    ).toContain('Sedang tidak tersedia')

    const disabledColIndicator = screen.getByTestId(
      'column-disabled-indicator-cx/gpt-5.6-sol',
    )
    expect(disabledColIndicator).toBeTruthy()
    expect(disabledColIndicator.textContent).toContain('Sedang tidak tersedia')
    expect(disabledColIndicator.textContent).toContain(
      'Pemeliharaan sistem OpenAI',
    )

    expect(
      screen.queryByTestId(
        'column-disabled-indicator-ag/gemini-3.7-flash-high',
      ),
    ).toBeNull()
  })

  it('prevents retry on disabled model in CompareGrid', () => {
    const onRetry = vi.fn()
    const generations = [
      {
        id: 'gen-disabled',
        modelId: 'cx/gpt-5.6-sol',
        status: 'failed',
        error: { message: 'Model disabled', code: 'ERR-MODEL-DISABLED' },
      },
      {
        id: 'gen-active',
        modelId: 'ag/gemini-3.7-flash-high',
        status: 'failed',
        error: { message: 'Temporary rate limit', code: 'ERR-RATE-LIMIT' },
      },
    ]

    render(<CompareGrid generations={generations} onRetry={onRetry} />)

    // Active failed model should have retry button
    const retryActive = screen.getByTestId('retry-gen-active')
    expect(retryActive).toBeTruthy()
    fireEvent.click(retryActive)
    expect(onRetry).toHaveBeenCalledWith('gen-active')

    // Disabled model should NOT have retry button
    expect(screen.queryByTestId('retry-gen-disabled')).toBeNull()
  })
})
