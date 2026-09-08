import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ModelSelector } from '../../src/components/chat/ModelSelector'
import { getModelCatalog as getRealModelCatalog } from '../../src/lib/models/registry'

vi.mock('../../src/server/functions/models', () => ({
  getModelCatalog: vi.fn(async () => getRealModelCatalog()),
}))

describe('ModelSelector Vendor Grouping & Frontier Models', () => {
  afterEach(cleanup)

  it('renders authentic vendor groups (OpenAI, Google, Anthropic, xAI) in order', async () => {
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

    // Verify vendor headers exist
    expect(screen.getByTestId('vendor-group-openai')).toBeTruthy()
    expect(screen.getByTestId('vendor-group-google')).toBeTruthy()
    expect(screen.getByTestId('vendor-group-anthropic')).toBeTruthy()
    expect(screen.getByTestId('vendor-group-xai')).toBeTruthy()

    // Verify key frontier models are in document
    expect(screen.getByTestId('model-option-cx/gpt-5.6-terra')).toBeTruthy()
    expect(
      screen.getByTestId('model-option-ag/claude-opus-4-6-thinking'),
    ).toBeTruthy()
    expect(screen.getByTestId('model-option-gcli/grok-4.6')).toBeTruthy()
    expect(
      screen.getByTestId('model-option-ag/gemini-3.7-flash-high'),
    ).toBeTruthy()
  })

  it('filters models by vendor query for Anthropic and xAI', async () => {
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

    const searchInput = screen.getByTestId('model-search-input')

    // Search Anthropic
    fireEvent.change(searchInput, { target: { value: 'claude' } })
    expect(
      screen.getByTestId('model-option-ag/claude-opus-4-6-thinking'),
    ).toBeTruthy()
    expect(screen.getByTestId('model-option-ag/claude-sonnet-4-6')).toBeTruthy()
    expect(screen.queryByTestId('model-option-cx/gpt-5.6-terra')).toBeNull()

    // Search xAI
    fireEvent.change(searchInput, { target: { value: 'grok' } })
    expect(screen.getByTestId('model-option-gcli/grok-4.6')).toBeTruthy()
    expect(screen.getByTestId('model-option-gcli/grok-4.5')).toBeTruthy()
    expect(
      screen.queryByTestId('model-option-ag/claude-opus-4-6-thinking'),
    ).toBeNull()
  })

  it('allows multi-model selection across different vendors in compare mode', async () => {
    const onCompareChange = vi.fn()
    render(
      <ModelSelector
        value="cx/gpt-5.6-terra"
        onChange={vi.fn()}
        compareEnabled={true}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={['cx/gpt-5.6-terra', 'ag/claude-opus-4-6-thinking']}
        onCompareModelIdsChange={onCompareChange}
      />,
    )

    fireEvent.click(screen.getByTestId('model-selector-trigger'))

    await waitFor(() => {
      expect(screen.getByTestId('model-search-input')).toBeTruthy()
    })

    // Click Grok 4.6 to add to compare
    const grokOption = screen.getByTestId('model-option-gcli/grok-4.6')
    fireEvent.click(grokOption)

    expect(onCompareChange).toHaveBeenCalledWith([
      'cx/gpt-5.6-terra',
      'ag/claude-opus-4-6-thinking',
      'gcli/grok-4.6',
    ])
  })
})
