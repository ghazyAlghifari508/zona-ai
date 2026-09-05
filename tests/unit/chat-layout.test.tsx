import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Chat Layout Structure & Composer Positioning', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('maintains independent scroll container for messages and fixed container for composer', () => {
    const { container } = render(
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-hairline/60 bg-pure-white px-4">
          <span data-testid="topbar-compare-label">Mode banding</span>
        </header>
        <div
          data-testid="chat-messages-scroll-area"
          className="zona-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto"
        >
          <div data-testid="message-list-mock">Messages here</div>
        </div>
        <div
          data-testid="chat-composer-container"
          className="shrink-0 border-t border-hairline/60 bg-pure-white px-4 pb-4 pt-3"
        >
          <div data-testid="composer-mock">Composer here</div>
        </div>
      </div>,
    )

    const scrollArea = container.querySelector(
      '[data-testid="chat-messages-scroll-area"]',
    ) as HTMLElement
    const composerContainer = container.querySelector(
      '[data-testid="chat-composer-container"]',
    ) as HTMLElement

    expect(scrollArea).not.toBeNull()
    expect(composerContainer).not.toBeNull()

    // Composer must be a sibling to the scroll container, NOT inside it
    expect(scrollArea.contains(composerContainer)).toBe(false)
    expect(composerContainer.parentElement).toBe(scrollArea.parentElement)

    // Scroll area must have flex-1 and overflow-y-auto to absorb vertical scroll
    expect(scrollArea.className).toContain('overflow-y-auto')
    expect(scrollArea.className).toContain('flex-1')

    // Composer container must have shrink-0 so it remains anchored at bottom
    expect(composerContainer.className).toContain('shrink-0')
  })
})
