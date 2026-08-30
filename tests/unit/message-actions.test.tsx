import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MessageList } from '../../src/components/chat/MessageList'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [
    {
      id: 'auto',
      displayName: 'Auto',
      provider: 'zona-router',
    },
    {
      id: 'gemini',
      displayName: 'Gemini',
      provider: 'antigravity',
    },
  ],
  findCatalogEntry: (
    catalog: Array<{ id: string }>,
    modelId?: string,
  ) => catalog.find((entry) => entry.id === modelId) ?? null,
}))

describe('assistant message actions', () => {
  afterEach(cleanup)

  it('shows the actual routed model and regenerates that response', () => {
    const onRegenerate = vi.fn()
    render(
      <MessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Answer',
            modelId: 'gemini',
            routerModelId: 'ag/gemini-test',
          },
        ]}
        onRegenerate={onRegenerate}
      />,
    )

    expect(screen.getByText('Gemini')).toBeTruthy()
    expect(screen.getByAltText('Google Gemini')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Jawab ulang' }))
    expect(onRegenerate).toHaveBeenCalledWith('assistant-1')
  })

  it('copies the assistant response', () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(
      <MessageList
        messages={[
          {
            id: 'assistant-1',
            role: 'assistant',
            content: 'Answer',
            modelId: 'gemini',
          },
        ]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Salin' }))
    expect(writeText).toHaveBeenCalledWith('Answer')
  })
})
