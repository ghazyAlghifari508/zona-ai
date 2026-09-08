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

  it('renders unordered list with bullet list items', () => {
    const { container } = render(
      React.createElement(MarkdownContent, {
        text: '- First item\n- Second item\n- Third item',
      }),
    )
    const ul = container.querySelector('ul')
    expect(ul).toBeTruthy()
    const items = container.querySelectorAll('li')
    expect(items.length).toBe(3)
  })

  it('renders ordered list with numbered list items', () => {
    const { container } = render(
      React.createElement(MarkdownContent, {
        text: '1. Step one\n2. Step two\n3. Step three',
      }),
    )
    const ol = container.querySelector('ol')
    expect(ol).toBeTruthy()
    const items = container.querySelectorAll('li')
    expect(items.length).toBe(3)
  })

  it('renders nested lists preserving hierarchical list structure', () => {
    const { container } = render(
      React.createElement(MarkdownContent, {
        text: '- Parent 1\n  - Child 1A\n  - Child 1B\n- Parent 2',
      }),
    )
    const lists = container.querySelectorAll('ul')
    expect(lists.length).toBe(2)
    const innerUl = container.querySelector('li > ul')
    expect(innerUl).toBeTruthy()
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
