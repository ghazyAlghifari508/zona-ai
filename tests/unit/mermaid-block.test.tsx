import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MermaidBlock } from '../../src/components/chat/MermaidBlock'

vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockImplementation((id: string, code: string) => {
      if (code.includes('invalid_syntax')) {
        return Promise.reject(new Error('Syntax error in graph'))
      }
      return Promise.resolve({ svg: `<svg id="${id}"><text>Diagram Test</text></svg>` })
    }),
  },
}))

describe('MermaidBlock', () => {
  afterEach(cleanup)

  it('renders valid mermaid diagram as svg preview by default', async () => {
    const validCode = 'graph TD\n  A --> B'
    render(<MermaidBlock code={validCode} />)

    expect(await screen.findByText('Diagram Test')).toBeDefined()
    expect(screen.getByTestId('mermaid-block')).toBeDefined()
    expect(screen.getByRole('button', { name: /Diagram/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /Source|Code/i })).toBeDefined()
  })

  it('gracefully falls back to raw code when mermaid syntax is invalid', async () => {
    const invalidCode = 'graph TD\ninvalid_syntax'
    render(<MermaidBlock code={invalidCode} />)

    expect(await screen.findByTestId('mermaid-fallback')).toBeDefined()
    expect(screen.getByText(/invalid_syntax/)).toBeDefined()
  })
})
