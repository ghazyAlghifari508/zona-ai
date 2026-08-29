import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  type ChatMessage,
  MessageList,
} from '../../src/components/chat/MessageList'

const messages = (count: number): ChatMessage[] =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index),
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${index}`,
  }))

describe('MessageList virtualization', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800)
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600)
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('keeps the normal DOM path at 50 messages', () => {
    const { container } = render(<MessageList messages={messages(50)} />)
    expect(container.querySelectorAll('[data-index]')).toHaveLength(0)
    expect(container.textContent).toContain('Message 49')
  })

  it('renders only virtual rows above 50 messages', async () => {
    const { container } = render(<MessageList messages={messages(150)} />)
    await waitFor(() => {
      const rows = container.querySelectorAll('[data-index]')
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.length).toBeLessThan(50)
    })
  })

  it('renders 500 messages with fewer than 50 DOM rows (estimateSize 80, overscan 5)', async () => {
    const { container } = render(<MessageList messages={messages(500)} />)
    await waitFor(() => {
      const rows = container.querySelectorAll('[data-index]')
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.length).toBeLessThan(50)
    })
  })
})
