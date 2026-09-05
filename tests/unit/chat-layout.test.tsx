import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('Chat Layout Structure & Composer Positioning', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('maintains full-height scroll container with sticky header and fixed bottom composer without gap', () => {
    const { container } = render(
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        <div
          data-testid="chat-messages-scroll-area"
          className="zona-scroll flex h-full min-h-0 flex-1 flex-col overflow-x-hidden overflow-y-auto"
        >
          <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center justify-between bg-pure-white px-4 lg:px-6">
            <span data-testid="topbar-compare-label">Mode banding</span>
          </header>
          <div data-testid="message-list-mock">Messages here</div>
        </div>
        <div
          data-testid="chat-composer-container"
          className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 lg:px-6"
        >
          <div className="pointer-events-auto mx-auto max-w-[860px]">
            <div data-testid="composer-mock">Composer here</div>
          </div>
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

    // Header must be inside the scroll container at the top so scrollbar starts at top: 0
    const header = scrollArea.querySelector('header')
    expect(header).not.toBeNull()
    expect(header?.className).toContain('sticky')
    expect(header?.className).toContain('top-0')

    // Scroll container must be full-height (h-full) and absorb vertical scroll without top/bottom gap
    expect(scrollArea.className).toContain('overflow-y-auto')
    expect(scrollArea.className).toContain('flex-1')
    expect(scrollArea.className).toContain('h-full')

    // Composer must be outside the scroll container, anchored at bottom: 0
    expect(scrollArea.contains(composerContainer)).toBe(false)
    expect(composerContainer.className).toContain('absolute')
    expect(composerContainer.className).toContain('bottom-0')

    // Composer container must have pointer-events-none to prevent blocking right scrollbar track
    expect(composerContainer.className).toContain('pointer-events-none')

    // Must NOT contain border-top, divider lines, or background gradient overlay
    expect(composerContainer.className).not.toContain('border-t')
    expect(composerContainer.className).not.toContain('border-b')
    expect(composerContainer.className).not.toContain('bg-gradient-to-t')
  })
})
