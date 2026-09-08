import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

describe('Chat reset credit UI in GlobalNav', () => {
  beforeEach(() => {
    cleanup()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders leading reset credit button when in app mode', () => {
    const handleReset = vi.fn()
    render(
      <GlobalNav
        authState="authenticated"
        mode="app"
        leading={
          <button
            type="button"
            data-testid="reset-credits-btn"
            onClick={handleReset}
          >
            Reset 100 Kredit
          </button>
        }
      />,
    )

    const btn = screen.getByTestId('reset-credits-btn')
    expect(btn).toBeDefined()
    expect(btn.textContent).toContain('Reset 100 Kredit')
  })

  it('triggers reset callback when reset button is clicked', () => {
    const handleReset = vi.fn()
    render(
      <GlobalNav
        authState="authenticated"
        mode="app"
        leading={
          <button
            type="button"
            data-testid="reset-credits-btn"
            onClick={handleReset}
          >
            Reset 100 Kredit
          </button>
        }
      />,
    )

    const btn = screen.getByTestId('reset-credits-btn')
    fireEvent.click(btn)
    expect(handleReset).toHaveBeenCalledTimes(1)
  })

  it('disables button when resetting is in progress', () => {
    render(
      <GlobalNav
        authState="authenticated"
        mode="app"
        leading={
          <button
            type="button"
            data-testid="reset-credits-btn"
            disabled={true}
          >
            Mereset...
          </button>
        }
      />,
    )

    const btn = screen.getByTestId('reset-credits-btn') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    expect(btn.textContent).toContain('Mereset...')
  })

  it('does not render leading reset credit button when in marketing mode', () => {
    render(
      <GlobalNav
        authState="unauthenticated"
        mode="marketing"
        leading={
          <button type="button" data-testid="reset-credits-btn">
            Reset 100 Kredit
          </button>
        }
      />,
    )

    expect(screen.queryByTestId('reset-credits-btn')).toBeNull()
  })
})
