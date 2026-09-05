import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReasoningSection } from '../../src/components/chat/ReasoningSection'

describe('ReasoningSection', () => {
  afterEach(cleanup)

  it('renders nothing when reasoning content is null', () => {
    const { container } = render(<ReasoningSection content={null} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when reasoning content is undefined', () => {
    const { container } = render(<ReasoningSection content={undefined} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when reasoning content is whitespace-only', () => {
    const { container } = render(<ReasoningSection content={'   \n  '} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows collapsed toggle by default when reasoning content exists', () => {
    render(<ReasoningSection content={'langkah 1: analisis input'} />)

    const toggle = screen.getByRole('button', { name: /reasoning/i })
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('reasoning-panel')).toBeNull()
  })

  it('reveals read-only panel on toggle and hides it on second toggle', () => {
    render(<ReasoningSection content={'langkah 1: analisis input'} />)

    const toggle = screen.getByRole('button', { name: /reasoning/i })
    fireEvent.click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    const panel = screen.getByTestId('reasoning-panel')
    expect(panel.textContent).toContain('langkah 1: analisis input')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(panel.querySelector('textarea, input')).toBeNull()

    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('reasoning-panel')).toBeNull()
  })

  it('renders full long reasoning in a read-only panel', () => {
    const longReasoning = Array.from(
      { length: 400 },
      (_, i) => `baris ${i}`,
    ).join('\n')
    render(<ReasoningSection content={longReasoning} />)

    fireEvent.click(screen.getByRole('button', { name: /reasoning/i }))

    const panel = screen.getByTestId('reasoning-panel')
    expect(panel.textContent).toContain('baris 399')
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(panel.querySelector('textarea, input')).toBeNull()
  })
})
