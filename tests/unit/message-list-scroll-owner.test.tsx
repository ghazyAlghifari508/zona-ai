import { cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ChatMessage,
  MessageList,
} from '../../src/components/chat/MessageList'

vi.mock('../../src/components/chat/useModelCatalog', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../src/components/chat/useModelCatalog')
    >()
  return { ...actual, useModelCatalog: () => [] }
})

const messages = (count: number, suffix = ''): ChatMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index),
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${index}${suffix}`,
  }))

function captureScroll(el: HTMLElement): { values: number[] } {
  const values: number[] = []
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => values.at(-1) ?? 0,
    set: (value: number) => values.push(value),
  })
  Object.defineProperty(el, 'scrollHeight', {
    configurable: true,
    get: () => 600,
  })
  return { values }
}

function ExternalScrollHarness({ msgs }: { msgs: ChatMessage[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={containerRef} data-testid="external-scroll">
      <MessageList messages={msgs} scrollRef={containerRef} />
    </div>
  )
}

describe('MessageList scroll ownership', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('auto-scrolls the external scroll container when content changes', () => {
    const { rerender } = render(<ExternalScrollHarness msgs={messages(4)} />)

    const external = document.querySelector(
      '[data-testid="external-scroll"]',
    ) as HTMLElement
    const capture = captureScroll(external)

    rerender(<ExternalScrollHarness msgs={messages(4, ' updated')} />)

    expect(capture.values).toContain(600)
  })

  it('keeps self-scroll ownership when no scrollRef is provided', () => {
    const { rerender } = render(<MessageList messages={messages(4)} />)

    const ownRoot = document.querySelector(
      '[data-testid="message-list"]',
    ) as HTMLElement
    const capture = captureScroll(ownRoot)

    rerender(<MessageList messages={messages(4, ' updated')} />)

    expect(capture.values).toContain(600)
  })

  it('renders messages through the external scroll container path', () => {
    const { container } = render(<ExternalScrollHarness msgs={messages(6)} />)

    expect(container.textContent).toContain('Message 5')
    expect(
      document.querySelector('[data-testid="external-scroll"]')?.textContent,
    ).toContain('Message 0')
  })
})
