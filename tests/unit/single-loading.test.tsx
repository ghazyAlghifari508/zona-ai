import { cleanup, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ChatMessage,
  MessageList,
} from '../../src/components/chat/MessageList'

const pendingAssistant = (
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id: 'asst-pending',
  role: 'assistant',
  content: '',
  modelId: 'mimo-v2.5',
  streaming: true,
  ...overrides,
})

const userMsg: ChatMessage = { id: 'u1', role: 'user', content: 'Hai' }

function ExternalScrollHarness({ msgs }: { msgs: ChatMessage[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  return (
    <div ref={containerRef} data-testid="external-scroll">
      <MessageList messages={msgs} scrollRef={containerRef} />
    </div>
  )
}

function mockLayout() {
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
}

describe('Single Mode loading indicator (TypingDots)', () => {
  beforeEach(mockLayout)

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders typing dots when assistant message is streaming and content is empty', () => {
    render(<MessageList messages={[pendingAssistant()]} />)

    expect(screen.getByTestId('typing-dots')).toBeTruthy()
    expect(screen.getByLabelText('Sedang menulis')).toBeTruthy()
  })

  it('renders typing dots when streaming content is whitespace only', () => {
    render(
      <MessageList messages={[pendingAssistant({ content: '   \n  ' })]} />,
    )

    expect(screen.getByTestId('typing-dots')).toBeTruthy()
  })

  it('hides typing dots and renders markdown when first text token arrives', () => {
    render(<MessageList messages={[pendingAssistant({ content: 'Halo!' })]} />)

    expect(screen.queryByTestId('typing-dots')).toBeNull()
    expect(screen.getByText('Halo!')).toBeTruthy()
  })

  it('hides typing dots when streaming ends', () => {
    render(
      <MessageList
        messages={[pendingAssistant({ content: 'Selesai', streaming: false })]}
      />,
    )

    expect(screen.queryByTestId('typing-dots')).toBeNull()
  })

  it('hides typing dots and shows error state when generation fails', () => {
    render(
      <MessageList
        messages={[
          pendingAssistant({
            streaming: false,
            errorCode: 'ERR-001',
            errorMessage: 'Gagal. Coba lagi.',
          }),
        ]}
      />,
    )

    expect(screen.queryByTestId('typing-dots')).toBeNull()
    expect(screen.getByTestId('inline-error')).toBeTruthy()
  })

  it('hides typing dots when generation is cancelled', () => {
    render(<MessageList messages={[pendingAssistant({ streaming: false })]} />)

    expect(screen.queryByTestId('typing-dots')).toBeNull()
  })

  it('does not render typing dots for artifact pending state', () => {
    render(
      <MessageList
        messages={[
          pendingAssistant({
            artifactStatus: 'preparing',
            artifactKind: 'agent-skill',
          }),
        ]}
      />,
    )

    expect(screen.queryByTestId('typing-dots')).toBeNull()
    expect(screen.getByTestId('artifact-progress')).toBeTruthy()
  })
})

describe('MessageList smooth auto-scroll', () => {
  beforeEach(mockLayout)

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('smooth-scrolls the external container when messages change', () => {
    const { rerender } = render(<ExternalScrollHarness msgs={[userMsg]} />)

    const external = document.querySelector(
      '[data-testid="external-scroll"]',
    ) as HTMLElement
    Object.defineProperty(external, 'scrollHeight', {
      configurable: true,
      get: () => 600,
    })
    const scrollTo = vi.fn()
    external.scrollTo = scrollTo

    rerender(<ExternalScrollHarness msgs={[userMsg, pendingAssistant()]} />)

    expect(scrollTo).toHaveBeenCalledWith({ top: 600, behavior: 'smooth' })
  })

  it('falls back to instant scroll assignment when reduced motion is preferred', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
    const { rerender } = render(<ExternalScrollHarness msgs={[userMsg]} />)

    const external = document.querySelector(
      '[data-testid="external-scroll"]',
    ) as HTMLElement
    Object.defineProperty(external, 'scrollHeight', {
      configurable: true,
      get: () => 600,
    })
    const scrollTo = vi.fn()
    external.scrollTo = scrollTo
    const values: number[] = []
    Object.defineProperty(external, 'scrollTop', {
      configurable: true,
      get: () => values.at(-1) ?? 0,
      set: (value: number) => values.push(value),
    })

    rerender(<ExternalScrollHarness msgs={[userMsg, pendingAssistant()]} />)

    expect(scrollTo).not.toHaveBeenCalled()
    expect(values).toContain(600)
  })

  it('falls back to instant scroll assignment when smooth scroll throws', () => {
    const { rerender } = render(<ExternalScrollHarness msgs={[userMsg]} />)

    const external = document.querySelector(
      '[data-testid="external-scroll"]',
    ) as HTMLElement
    Object.defineProperty(external, 'scrollHeight', {
      configurable: true,
      get: () => 600,
    })
    external.scrollTo = vi.fn(() => {
      throw new Error('smooth unsupported')
    })
    const values: number[] = []
    Object.defineProperty(external, 'scrollTop', {
      configurable: true,
      get: () => values.at(-1) ?? 0,
      set: (value: number) => values.push(value),
    })

    rerender(<ExternalScrollHarness msgs={[userMsg, pendingAssistant()]} />)

    expect(values).toContain(600)
  })
})
