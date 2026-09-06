import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CodeBlock } from '../../src/components/chat/CodeBlock'
import { MessageList } from '../../src/components/chat/MessageList'
import {
  chatHighlightOptions,
  extractRawText,
} from '../../src/lib/chat/syntax-highlight'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [],
  findCatalogEntry: () => null,
}))

describe('syntax-highlight configuration', () => {
  it('registers dart and common languages with autodetection disabled', () => {
    expect(chatHighlightOptions.detect).toBe(false)
    expect(chatHighlightOptions.languages).toBeDefined()
    const languages = chatHighlightOptions.languages ?? {}
    expect(typeof languages.dart).toBe('function')
    expect(typeof languages.python).toBe('function')
    expect(typeof languages.javascript).toBe('function')
    expect(typeof languages.typescript).toBe('function')
    expect(typeof languages.java).toBe('function')
    expect(typeof languages.json).toBe('function')
    expect(typeof languages.bash).toBe('function')
  })

  it('extracts raw text recursively from React elements', () => {
    expect(extractRawText(null)).toBe('')
    expect(extractRawText(undefined)).toBe('')
    expect(extractRawText(true)).toBe('')
    expect(extractRawText(123)).toBe('123')
    expect(extractRawText('hello world')).toBe('hello world')

    const nestedNode = React.createElement(
      'span',
      { className: 'hljs-keyword' },
      'const',
      ' ',
      React.createElement('span', { className: 'hljs-title' }, 'foo'),
    )
    expect(extractRawText(nestedNode)).toBe('const foo')

    const arrayNode = [
      React.createElement('span', { key: '1' }, 'line 1\n'),
      React.createElement('span', { key: '2' }, 'line 2'),
    ]
    expect(extractRawText(arrayNode)).toBe('line 1\nline 2')
  })

  it('provides raw text to copy button in CodeBlock', async () => {
    let copiedText = ''
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(async (text: string) => {
          copiedText = text
        }),
      },
    })

    const highlightedChildren = React.createElement(
      'span',
      { className: 'hljs-keyword' },
      'def',
      ' ',
      React.createElement('span', { className: 'hljs-title' }, 'add'),
      '(a, b):',
    )

    render(
      React.createElement(
        CodeBlock,
        { className: 'hljs language-python' },
        highlightedChildren,
      ),
    )

    const copyBtn = screen.getByTestId('codeblock-copy')
    expect(copyBtn).toBeTruthy()
    copyBtn.click()
    expect(copiedText).toBe('def add(a, b):')
  })

  it('renders fenced python code blocks cleanly in MessageList', () => {
    const content = [
      'Berikut kodenya:',
      '',
      '```python',
      'def greet(name):',
      '    return f"Halo {name}"',
      '```',
    ].join('\n')

    render(
      React.createElement(MessageList, {
        messages: [{ id: 'm1', role: 'assistant', content, modelId: 'auto' }],
      }),
    )

    expect(screen.getByText(/greet/)).toBeTruthy()
    expect(document.body.textContent ?? '').not.toContain('[object Object]')
  })

  it('renders fenced dart code blocks cleanly in MessageList', () => {
    const content = [
      'Contoh Dart:',
      '',
      '```dart',
      'void main() {',
      '  print("Hello Dart");',
      '}',
      '```',
    ].join('\n')

    render(
      React.createElement(MessageList, {
        messages: [{ id: 'm2', role: 'assistant', content, modelId: 'auto' }],
      }),
    )

    expect(screen.getByText(/main/)).toBeTruthy()
    expect(document.body.textContent ?? '').not.toContain('[object Object]')
  })

  it('gracefully handles unknown code block languages without throwing', () => {
    const content = [
      'Unknown language fence:',
      '',
      '```nonexistentlangxyz',
      'echo "fallback to plain code"',
      '```',
    ].join('\n')

    expect(() => {
      render(
        React.createElement(MessageList, {
          messages: [{ id: 'm3', role: 'assistant', content, modelId: 'auto' }],
        }),
      )
    }).not.toThrow()

    expect(screen.getByText(/fallback to plain code/)).toBeTruthy()
    expect(document.body.textContent ?? '').not.toContain('[object Object]')
  })
})
