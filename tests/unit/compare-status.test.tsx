import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../../src/components/chat/Composer'
import { MessageList } from '../../src/components/chat/MessageList'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [
    {
      id: 'gemini-3.7-flash-high',
      displayName: 'Gemini 3.7 Flash',
      provider: 'google',
      vendor: 'Google',
      creditCost: 1,
      capabilities: { vision: true },
    },
    {
      id: 'gpt-5.6-sol',
      displayName: 'GPT 5.6 Sol',
      provider: 'openai',
      vendor: 'OpenAI',
      creditCost: 5,
      capabilities: { vision: true },
    },
    {
      id: 'qwen3.8-flash',
      displayName: 'Qwen 3.8 Flash',
      provider: 'qwen',
      vendor: 'Alibaba',
      creditCost: 1,
      capabilities: { vision: true },
    },
    {
      id: 'mimo-v2.5',
      displayName: 'MiMo V2.5',
      provider: 'xiaomi',
      vendor: 'Xiaomi',
      creditCost: 2,
      capabilities: { vision: true },
    },
  ],
  findCatalogEntry: (
    catalog: Array<{ id: string; displayName: string; creditCost?: number }>,
    id: string,
  ) =>
    catalog.find((m) => m.id === id) ?? {
      id,
      displayName: id,
      creditCost: 1,
    },
}))

describe('Compact Compare Mode Status & Spacing', () => {
  afterEach(cleanup)

  it('renders compact compare status inside composer card when compare is active', () => {
    render(
      <Composer
        modelValue="gemini-3.7-flash-high"
        compareEnabled={true}
        compareModelIds={[
          'gemini-3.7-flash-high',
          'gpt-5.6-sol',
          'qwen3.8-flash',
          'mimo-v2.5',
        ]}
        credits={100}
        placement="inline"
      />,
    )

    const composerCard = screen.getByTestId('composer')
    const status = screen.getByTestId('composer-compare-status')

    // Status must be inside composer card to prevent floating overlay
    expect(composerCard.contains(status)).toBe(true)

    // Should display model count and total credits (1 + 5 + 1 + 2 = 9 kredit)
    expect(status.textContent).toContain('4 model')
    expect(status.textContent).toContain('9 kredit')
  })

  it('indicates when credits are insufficient inside the compact status', () => {
    render(
      <Composer
        modelValue="gemini-3.7-flash-high"
        compareEnabled={true}
        compareModelIds={['gemini-3.7-flash-high', 'gpt-5.6-sol']}
        credits={3} // Needs 1 + 5 = 6
        placement="inline"
      />,
    )

    const status = screen.getByTestId('composer-compare-status')
    expect(status.textContent).toContain('2 model')
    expect(status.textContent).toContain('6 kredit')
    expect(status.textContent?.toLowerCase()).toMatch(/butuh|sisa|kurang/i)
  })

  it('does not render compare status when compare mode is disabled', () => {
    render(
      <Composer
        modelValue="gemini-3.7-flash-high"
        compareEnabled={false}
        compareModelIds={[]}
        credits={100}
        placement="inline"
      />,
    )

    expect(screen.queryByTestId('composer-compare-status')).toBeNull()
  })

  it('provides bottom scroll padding in MessageList for compare mode', () => {
    const scrollRef = { current: document.createElement('div') }
    const { container } = render(
      <MessageList
        messages={[]}
        hasUsedCompareMode={true}
        scrollRef={scrollRef}
      />,
    )

    const inner = container.querySelector('[class*="pb-"]')
    expect(inner).toBeTruthy()
    // Must provide at least pb-48 or pb-52 to clear sticky composer
    expect(inner?.className).toMatch(/pb-(48|52|56)/)
  })
})
