import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelSelector } from '../../src/components/chat/ModelSelector'
import { getModelCatalog as getRealModelCatalog } from '../../src/lib/models/registry'

vi.mock('../../src/server/functions/models', () => ({
  getHistoricalCatalog: vi.fn(async () => getRealModelCatalog()),
}))

vi.mock('../../src/components/chat/useModelCatalog', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/components/chat/useModelCatalog')
    >()
  return { ...actual, useModelCatalog: () => getRealModelCatalog() }
})

describe('ModelSelector Search feature', () => {
  afterEach(cleanup)

  it('renders search input when popover is open', async () => {
    render(
      <ModelSelector
        value="gpt-5.6-sol"
        onChange={vi.fn()}
        compareEnabled={false}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={[]}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    const trigger = screen.getByTestId('model-selector-trigger')
    fireEvent.click(trigger)

    await waitFor(() => {
      expect(screen.getByTestId('model-search-input')).toBeTruthy()
    })
  })

  it('filters models in real-time by display name', async () => {
    render(
      <ModelSelector
        value="gpt-5.6-sol"
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

    const searchInput = screen.getByTestId('model-search-input')
    fireEvent.change(searchInput, { target: { value: 'gem' } })

    expect(screen.getByTestId('model-option-gemini-3.7-flash-high')).toBeTruthy()
    expect(screen.queryByTestId('model-option-gpt-5.6-sol')).toBeNull()
    expect(screen.queryByTestId('model-option-mimo-v2.5')).toBeNull()
  })

  it('filters models by vendor (e.g. xiaomi -> MiMo, openai -> GPT)', async () => {
    render(
      <ModelSelector
        value="gpt-5.6-sol"
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

    const searchInput = screen.getByTestId('model-search-input')
    fireEvent.change(searchInput, { target: { value: 'xiaomi' } })

    expect(screen.getByTestId('model-option-mimo-v2.5')).toBeTruthy()
    expect(screen.queryByTestId('model-option-gpt-5.6-sol')).toBeNull()

    fireEvent.change(searchInput, { target: { value: 'openai' } })
    expect(screen.getByTestId('model-option-gpt-5.6-sol')).toBeTruthy()
    expect(screen.queryByTestId('model-option-mimo-v2.5')).toBeNull()
  })

  it('shows empty state feedback when no models match', async () => {
    render(
      <ModelSelector
        value="gpt-5.6-sol"
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

    const searchInput = screen.getByTestId('model-search-input')
    fireEvent.change(searchInput, { target: { value: 'xyz-not-found' } })

    const empty = screen.getByTestId('model-search-empty')
    expect(empty).toBeTruthy()
    expect(empty.textContent).toContain('Tidak ada model ditemukan')
  })

  it('preserves selected compare models when search is active', async () => {
    const onCompareChange = vi.fn()
    render(
      <ModelSelector
        value="gpt-5.6-sol"
        onChange={vi.fn()}
        compareEnabled={true}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={['gpt-5.6-sol', 'gemini-3.7-flash-high']}
        onCompareModelIdsChange={onCompareChange}
      />,
    )

    fireEvent.click(screen.getByTestId('model-selector-trigger'))

    await waitFor(() => {
      expect(screen.getByTestId('model-search-input')).toBeTruthy()
    })

    // Compare counter still shows 2/4 (COMPARE_MAX_MODELS is 4)
    expect(screen.getByTestId('compare-counter').textContent).toBe('2/4')

    // Filter to qwen
    const searchInput = screen.getByTestId('model-search-input')
    fireEvent.change(searchInput, { target: { value: 'qwen' } })

    // Click qwen to add to compare
    const qwenOption = screen.getByTestId('model-option-qwen3.8-flash')
    fireEvent.click(qwenOption)

    // Should call toggle with qwen, preserving previous selection
    expect(onCompareChange).toHaveBeenCalledWith([
      'gpt-5.6-sol',
      'gemini-3.7-flash-high',
      'qwen3.8-flash',
    ])
  })

  it('resets search query when popover closes and reopens', async () => {
    render(
      <ModelSelector
        value="gpt-5.6-sol"
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

    const searchInput = screen.getByTestId('model-search-input')
    fireEvent.change(searchInput, { target: { value: 'gem' } })
    expect(screen.queryByTestId('model-option-gpt-5.6-sol')).toBeNull()

    // Select gemini to close
    fireEvent.click(screen.getByTestId('model-option-gemini-3.7-flash-high'))

    // Reopen
    fireEvent.click(screen.getByTestId('model-selector-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('model-search-input')).toBeTruthy()
    })

    const reopenedInput = screen.getByTestId('model-search-input') as HTMLInputElement
    expect(reopenedInput.value).toBe('')
    expect(screen.getByTestId('model-option-gpt-5.6-sol')).toBeTruthy()
  })
})
