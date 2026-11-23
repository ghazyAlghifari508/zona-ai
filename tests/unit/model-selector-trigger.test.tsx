import { cleanup, render, screen, waitFor } from '@testing-library/react'
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

describe('ModelSelector trigger UI in Single and Compare Mode', () => {
  afterEach(cleanup)

  it('renders single model icon and name when compare mode is disabled', async () => {
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

    await waitFor(() => {
      expect(screen.getByText('GPT 5.6 Sol')).toBeTruthy()
    })

    expect(screen.queryByTestId('compare-stacked-icons')).toBeNull()
    expect(screen.getByTestId('model-selector-trigger')).toBeTruthy()
  })

  it('renders stacked overlapping icons for 2 selected models in compare mode', async () => {
    render(
      <ModelSelector
        value="gpt-5.6-sol"
        onChange={vi.fn()}
        compareEnabled={true}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={['gpt-5.6-sol', 'gemini-3.7-flash-high']}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('compare-trigger-label').textContent).toBe(
        '2 model dipilih',
      )
    })

    const stack = screen.getByTestId('compare-stacked-icons')
    expect(stack).toBeTruthy()

    const icon1 = screen.getByTestId('stacked-icon-gpt-5.6-sol')
    const icon2 = screen.getByTestId('stacked-icon-gemini-3.7-flash-high')
    expect(icon1).toBeTruthy()
    expect(icon2).toBeTruthy()

    const icons = stack.querySelectorAll('[data-testid^="stacked-icon-"]')
    expect(icons.length).toBe(2)
    expect(icons[0].getAttribute('data-testid')).toBe(
      'stacked-icon-gpt-5.6-sol',
    )
    expect(icons[1].getAttribute('data-testid')).toBe(
      'stacked-icon-gemini-3.7-flash-high',
    )
  })

  it('renders stacked overlapping icons for 3 selected models in compare mode', async () => {
    render(
      <ModelSelector
        value="gpt-5.6-sol"
        onChange={vi.fn()}
        compareEnabled={true}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={[
          'gpt-5.6-sol',
          'gemini-3.7-flash-high',
          'qwen3.8-flash',
        ]}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('compare-trigger-label').textContent).toBe(
        '3 model dipilih',
      )
    })

    const stack = screen.getByTestId('compare-stacked-icons')
    const icons = stack.querySelectorAll('[data-testid^="stacked-icon-"]')
    expect(icons.length).toBe(3)
    expect(icons[0].getAttribute('data-testid')).toBe(
      'stacked-icon-gpt-5.6-sol',
    )
    expect(icons[1].getAttribute('data-testid')).toBe(
      'stacked-icon-gemini-3.7-flash-high',
    )
    expect(icons[2].getAttribute('data-testid')).toBe(
      'stacked-icon-qwen3.8-flash',
    )
  })

  it('renders stacked overlapping icons for 4 selected models in compare mode', async () => {
    render(
      <ModelSelector
        value="gpt-5.6-sol"
        onChange={vi.fn()}
        compareEnabled={true}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={[
          'gpt-5.6-sol',
          'gemini-3.7-flash-high',
          'qwen3.8-flash',
          'glm-5.3-flash',
        ]}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('compare-trigger-label').textContent).toBe(
        '4 model dipilih',
      )
    })

    const stack = screen.getByTestId('compare-stacked-icons')
    const icons = stack.querySelectorAll('[data-testid^="stacked-icon-"]')
    expect(icons.length).toBe(4)
    expect(icons[0].getAttribute('data-testid')).toBe(
      'stacked-icon-gpt-5.6-sol',
    )
    expect(icons[1].getAttribute('data-testid')).toBe(
      'stacked-icon-gemini-3.7-flash-high',
    )
    expect(icons[2].getAttribute('data-testid')).toBe(
      'stacked-icon-qwen3.8-flash',
    )
    expect(icons[3].getAttribute('data-testid')).toBe(
      'stacked-icon-glm-5.3-flash',
    )
  })

  it('dynamically updates stacked icons when compareModelIds changes or switches back to single mode', async () => {
    const { rerender } = render(
      <ModelSelector
        value="gpt-5.6-sol"
        onChange={vi.fn()}
        compareEnabled={true}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={['gpt-5.6-sol', 'hy3']}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('compare-trigger-label').textContent).toBe(
        '2 model dipilih',
      )
    })
    expect(screen.getByTestId('stacked-icon-hy3')).toBeTruthy()

    // Add 3rd model (mimo-v2.5)
    rerender(
      <ModelSelector
        value="gpt-5.6-sol"
        onChange={vi.fn()}
        compareEnabled={true}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={['gpt-5.6-sol', 'hy3', 'mimo-v2.5']}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    expect(screen.getByTestId('compare-trigger-label').textContent).toBe(
      '3 model dipilih',
    )
    expect(screen.getByTestId('stacked-icon-mimo-v2.5')).toBeTruthy()

    // Switch compare off
    rerender(
      <ModelSelector
        value="gpt-5.6-sol"
        onChange={vi.fn()}
        compareEnabled={false}
        onCompareEnabledChange={vi.fn()}
        compareModelIds={[]}
        onCompareModelIdsChange={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('compare-stacked-icons')).toBeNull()
    expect(screen.getByText('GPT 5.6 Sol')).toBeTruthy()
  })
})
