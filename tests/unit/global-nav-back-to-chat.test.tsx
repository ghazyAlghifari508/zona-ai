import { cleanup, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalNav } from '../../src/components/layout/GlobalNav'

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string
    children: React.ReactNode
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}))

vi.mock('../../src/components/layout/ProfileMenu', () => ({
  ProfileMenu: () => <div data-testid="mock-profile-menu">Profile</div>,
}))

vi.mock('../../src/server/functions/payments', () => ({
  getPricingSummaryFn: vi.fn().mockResolvedValue({
    balance: 100,
    activePlanId: 'free',
  }),
}))

describe('GlobalNav "Kembali ke chat" navigation behavior', () => {
  beforeEach(() => {
    cleanup()
    sessionStorage.clear()
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('renders "Kembali ke chat" pointing directly to root "/" when in marketing mode', () => {
    render(<GlobalNav authState="unauthenticated" mode="marketing" />)

    const backButton = screen.getByTestId('back-to-chat')
    expect(backButton).toBeTruthy()
    expect(backButton.textContent).toContain('Kembali ke chat')
    expect(backButton.getAttribute('href')).toBe('/')
  })

  it('always navigates to "/" even if previous conversation was stored in sessionStorage', () => {
    sessionStorage.setItem('zona_last_conversation_id', 'previous-chat-xyz')

    render(
      <GlobalNav
        authState="authenticated"
        user={{ name: 'Test User', email: 'test@example.com' }}
        mode="marketing"
      />,
    )

    const backButton = screen.getByTestId('back-to-chat')
    expect(backButton).toBeTruthy()
    expect(backButton.textContent).toContain('Kembali ke chat')
    // MUST be strictly "/" and NOT "/chat/previous-chat-xyz"
    expect(backButton.getAttribute('href')).toBe('/')
    expect(backButton.getAttribute('href')).not.toContain('previous-chat-xyz')
  })

  it('maintains consistent FAQ and Bantuan navigation links in marketing mode', () => {
    render(<GlobalNav authState="unauthenticated" mode="marketing" />)

    const faqLink = screen.getByText('FAQ')
    const helpLink = screen.getByText('Bantuan')
    const backButton = screen.getByTestId('back-to-chat')

    expect(faqLink.getAttribute('href')).toBe('/faq')
    expect(helpLink.getAttribute('href')).toBe('/bantuan')
    expect(backButton.getAttribute('href')).toBe('/')
  })
})
