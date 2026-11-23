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

describe('Model catalog entry status', () => {
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


})

describe('ModelSelector disabled state', () => {
  afterEach(cleanup)

  it('keeps an inactive model visible but not selectable for new selections', async () => {
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
    expect(disabledOption.hasAttribute('disabled')).toBe(true)
    expect(
      screen.getByTestId('model-disabled-badge-cx/gpt-5.6-sol').textContent,
    ).toContain('Tidak tersedia')
    expect(screen.getByTestId('model-option-auto')).toBeTruthy()
  })
})

describe('CompareGrid disabled model integration', () => {
  afterEach(cleanup)

  it('displays "Tidak tersedia" indicator for disabled model column in CompareGrid', () => {
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

    const disabledColIndicator = screen.getByTestId(
      'column-disabled-indicator-cx/gpt-5.6-sol',
    )
    expect(disabledColIndicator).toBeTruthy()
    expect(disabledColIndicator.textContent).toContain('Tidak tersedia')
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
