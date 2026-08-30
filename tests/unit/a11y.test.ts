import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MessageList } from '../../src/components/chat/MessageList'

describe('a11y — static contract checks (WCAG 2.1 AA)', () => {
  afterEach(cleanup)

  it('MessageList container has role=log aria-live=polite aria-label', () => {
    render(
      React.createElement(MessageList, {
        messages: [{ id: 'm1', role: 'user', content: 'hi' }],
      }),
    )
    const list = document.querySelector('[data-testid="message-list"]')
    expect(list).not.toBeNull()
    expect(list?.getAttribute('role')).toBe('log')
    expect(list?.getAttribute('aria-live')).toBe('polite')
    expect(list?.getAttribute('aria-label')).toBe('Chat messages')
  })

  it('app.css defines visible focus ring on :focus-visible', () => {
    const css = readFileSync(
      join(__dirname, '../../src/styles/app.css'),
      'utf8',
    )
    expect(css).toMatch(/:focus-visible/)
    expect(css).toMatch(/outline:\s*2px solid (var\(--color-notion-blue\)|#0075de)/)
  })

  it('app.css honors prefers-reduced-motion', () => {
    const css = readFileSync(
      join(__dirname, '../../src/styles/app.css'),
      'utf8',
    )
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/)
    expect(css).toMatch(/animation-duration:\s*0\.01ms/)
    expect(css).toMatch(/transition-duration:\s*0\.01ms/)
  })
})
