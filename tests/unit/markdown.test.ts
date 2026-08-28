import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { CodeBlock } from '../../src/components/chat/CodeBlock'

describe('markdown code block', () => {
  it('renders copy button', () => {
    render(React.createElement(CodeBlock, null, 'const x=1'))
    const btn = screen.getByText(/copy/i)
    expect(btn).toBeTruthy()
    expect(btn.textContent?.toLowerCase()).toContain('copy')
  })
  it('renders code content', () => {
    render(React.createElement(CodeBlock, null, 'const hello = "world"'))
    const code = screen.getByText(/const hello/)
    expect(code).toBeTruthy()
  })
})
