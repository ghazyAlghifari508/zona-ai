import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { MarkdownContent } from '../../src/components/chat/MarkdownContent'
import { MessageList } from '../../src/components/chat/MessageList'

describe('markdown XSS sanitization (MessageList + rehype-sanitize)', () => {
  it('keeps script and iframe HTML inert in the shared renderer', () => {
    render(
      <MarkdownContent
        text={
          '<script>document.body.dataset.markdownScriptExecuted = "true"</script><iframe src="https://evil.example"></iframe>'
        }
      />,
    )

    expect(document.querySelector('script, iframe')).toBeNull()
    expect(document.body.dataset.markdownScriptExecuted).toBeUndefined()
  })

  it('strips script tags from assistant markdown', () => {
    render(
      React.createElement(MessageList, {
        messages: [
          {
            id: 'm1',
            role: 'assistant',
            content:
              'Hello <script>alert("xss")</script> world <img src=x onerror=alert(1)>',
          },
        ],
      }),
    )
    expect(document.querySelector('script')).toBeNull()
    expect(screen.getByText(/Hello/)).toBeTruthy()
  })

  it('strips iframes and event handlers', () => {
    render(
      React.createElement(MessageList, {
        messages: [
          {
            id: 'm2',
            role: 'assistant',
            content:
              '<iframe src="https://evil.example"></iframe><div onclick="alert(1)">click</div>',
          },
        ],
      }),
    )
    expect(document.querySelector('iframe')).toBeNull()
    // no element may carry an inline event handler
    const all = document.querySelectorAll('*')
    for (const el of Array.from(all)) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name).not.toMatch(/^on/i)
      }
    }
  })

  it('renders benign markdown links', () => {
    render(
      React.createElement(MessageList, {
        messages: [
          {
            id: 'm3',
            role: 'assistant',
            content: '[docs](https://example.com)',
          },
        ],
      }),
    )
    const link = document.querySelector('a')
    expect(link?.getAttribute('href')).toBe('https://example.com')
  })
})
