import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [],
  findCatalogEntry: () => null,
}))

import { CodeBlock } from '../../src/components/chat/CodeBlock'
import { MarkdownContent } from '../../src/components/chat/MarkdownContent'
import { MessageList } from '../../src/components/chat/MessageList'

describe('shared markdown renderer', () => {
  it('renders GFM tables and unchecked task items accessibly', () => {
    render(
      React.createElement(MarkdownContent, {
        text: '| Name | State |\n| --- | --- |\n| PRD | Ready |\n\n- [ ] Review',
      }),
    )

    expect(screen.getByRole('cell', { name: 'PRD' })).toBeTruthy()
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
})

describe('markdown code block', () => {
  it('renders copy button', () => {
    render(React.createElement(CodeBlock, null, 'const x=1'))
    const btn = screen.getByText(/salin/i)
    expect(btn).toBeTruthy()
    expect(btn.textContent?.toLowerCase()).toContain('salin')
  })
  it('renders code content', () => {
    render(React.createElement(CodeBlock, null, 'const hello = "world"'))
    const code = screen.getByText(/const hello/)
    expect(code).toBeTruthy()
  })
  it('renders fenced code blocks without leaking React node tokens', () => {
    const content = [
      'Penjelasan singkat.',
      '',
      '```txt',
      'sample line 1',
      'sample line 2',
      '```',
      '',
      'Penutup.',
    ].join('\n')
    render(
      React.createElement(MessageList, {
        messages: [{ id: '1', role: 'assistant', content, modelId: 'auto' }],
      }),
    )
    expect(screen.getByText(/sample line 1/)).toBeTruthy()
    expect(screen.getByText(/sample line 2/)).toBeTruthy()
    expect(document.body.textContent ?? '').not.toContain('[object Object]')
  })
})
