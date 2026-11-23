import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelSelector } from '../../src/components/chat/ModelSelector'
import type { ModelCatalogEntry } from '../../src/lib/models/types'

const deepSeekCor: ModelCatalogEntry = {
  id: 'cor-prod/deepseek-v4-1-flash-1017',
  displayName: 'DeepSeek V4.1 Flash',
  provider: 'custom',
  vendor: 'DeepSeek',
  intelligenceLevel: 4,
  intelligenceScore: 90,
  intelligenceBars: 4,
  confidence: 'high',
  description: '',
  isDefault: false,
  creditTier: 'premium',
  creditCost: 15,
  capabilities: {
    text: true,
    vision: false,
    files: true,
    tools: true,
    reasoning: true,
    structuredOutput: true,
  },
  isActive: true,
  evaluationStatus: 'verified',
  visionStatus: 'unverified',
}

const deepSeekZro: ModelCatalogEntry = {
  ...deepSeekCor,
  id: 'zro-prod/zro/deepseek-v4.1-flash',
  intelligenceScore: 73,
  intelligenceBars: 3,
  creditCost: 6,
  visionStatus: 'supported',
  capabilities: {
    text: true,
    vision: true,
    files: true,
    tools: true,
    reasoning: true,
    structuredOutput: true,
  },
}

const inactive: ModelCatalogEntry = {
  ...deepSeekCor,
  id: 'ag/gemini-3.7-flash-high',
  displayName: 'Gemini 3.7 Flash High',
  isActive: false,
  disabledReason: 'Sedang dalam perbaikan koneksi',
}

const pending: ModelCatalogEntry = {
  ...deepSeekCor,
  id: 'cx/new-model',
  displayName: 'New Model',
  isActive: true,
  evaluationStatus: 'pending',
  creditCost: null,
}

const catalog = [deepSeekCor, deepSeekZro, inactive, pending]

vi.mock('../../src/server/functions/models', () => ({
  getHistoricalCatalog: vi.fn(async () => catalog),
}))

vi.mock('../../src/components/chat/useModelCatalog', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/components/chat/useModelCatalog')
    >()
  return { ...actual, useModelCatalog: () => catalog }
})

function renderSelector(value = deepSeekCor.id) {
  return render(
    <ModelSelector
      value={value}
      onChange={vi.fn()}
      compareEnabled={false}
      onCompareEnabledChange={vi.fn()}
      compareModelIds={[]}
      onCompareModelIdsChange={vi.fn()}
    />,
  )
}

async function openMenu() {
  fireEvent.click(screen.getByTestId('model-selector-trigger'))
  await waitFor(() => {
    expect(screen.getByTestId('model-search-input')).toBeTruthy()
  })
}

describe('P4 model selector semantics', () => {
  afterEach(cleanup)

  it('shows name-first rows with route labels and real credit costs', async () => {
    renderSelector()
    await openMenu()

    const corOption = screen.getByTestId(`model-option-${deepSeekCor.id}`)
    const zroOption = screen.getByTestId(`model-option-${deepSeekZro.id}`)

    expect(corOption.textContent).toContain('DeepSeek V4.1 Flash')
    expect(corOption.textContent).toContain('cor-prod')
    expect(corOption.textContent).toContain('15 kredit / permintaan')
    expect(zroOption.textContent).toContain('zro-prod')
    expect(zroOption.textContent).toContain('6 kredit / permintaan')
    expect(corOption.textContent).not.toContain('Premium')
    expect(zroOption.textContent).toContain('Vision')
  })

  it('disables inactive models with honest plain-text reasons and hides pending models', async () => {
    renderSelector()
    await openMenu()

    const inactiveOption = screen.getByTestId(`model-option-${inactive.id}`)

    expect(inactiveOption.getAttribute('aria-disabled')).toBe('true')
    expect(inactiveOption.textContent).toContain('Tidak tersedia')
    expect(inactiveOption.textContent).toContain(
      'Sedang dalam perbaikan koneksi',
    )
    expect(screen.queryByTestId(`model-option-${pending.id}`)).toBeNull()
  })

  it('keeps route search working for duplicate display names', async () => {
    renderSelector()
    await openMenu()
    fireEvent.change(screen.getByTestId('model-search-input'), {
      target: { value: 'zro' },
    })

    await waitFor(() => {
      expect(screen.getByTestId(`model-option-${deepSeekZro.id}`)).toBeTruthy()
    })
    expect(screen.queryByTestId(`model-option-${deepSeekCor.id}`)).toBeNull()
  })

  it('explains an unavailable selected model before submit', () => {
    renderSelector(inactive.id)
    const notice = screen.getByTestId('model-selector-unavailable')
    expect(notice.textContent).toContain('Tidak tersedia')
    expect(notice.textContent).toContain('Pilih model lain')
  })
})
