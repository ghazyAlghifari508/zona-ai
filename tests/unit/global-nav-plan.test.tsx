import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

const mockGetPricingSummaryFn = vi.fn()

vi.mock('../../src/server/functions/payments', () => ({
  getPricingSummaryFn: () => mockGetPricingSummaryFn(),
}))

function renderNavWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('GlobalNav dynamic subscription plan & layout spacing', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
    mockGetPricingSummaryFn.mockResolvedValue({
      balance: 100,
      activePlanId: 'free',
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders "Upgrade" for a free user by default and links to /pricing', () => {
    renderNavWithQuery(
      <GlobalNav
        authState="authenticated"
        user={{ name: 'Free User', email: 'free@example.com' }}
        planId="free"
      />,
    )

    const planBtn = screen.getByTestId('topnav-upgrade')
    expect(planBtn).toBeTruthy()
    expect(planBtn.textContent).toBe('Upgrade')
    expect(planBtn.getAttribute('href')).toBe('/pricing')
    expect(planBtn.className).not.toContain('ml-1')
  })

  it('renders "Pro" when user is on Pro plan and never shows "Upgrade"', () => {
    renderNavWithQuery(
      <GlobalNav
        authState="authenticated"
        user={{ name: 'Pro User', email: 'pro@example.com' }}
        planId="pro"
      />,
    )

    const planBtn = screen.getByTestId('topnav-upgrade')
    expect(planBtn).toBeTruthy()
    expect(planBtn.textContent).toBe('Pro')
    expect(planBtn.textContent).not.toBe('Upgrade')
    expect(planBtn.getAttribute('href')).toBe('/pricing')
  })

  it('renders "Ultra" when user is on Ultra plan and never shows "Upgrade"', () => {
    renderNavWithQuery(
      <GlobalNav
        authState="authenticated"
        user={{ name: 'Ultra User', email: 'ultra@example.com' }}
        planId="ultra"
      />,
    )

    const planBtn = screen.getByTestId('topnav-upgrade')
    expect(planBtn).toBeTruthy()
    expect(planBtn.textContent).toBe('Ultra')
    expect(planBtn.textContent).not.toBe('Upgrade')
    expect(planBtn.getAttribute('href')).toBe('/pricing')
  })

  it('dynamically loads plan from getPricingSummaryFn when planId prop is omitted', async () => {
    mockGetPricingSummaryFn.mockResolvedValueOnce({
      balance: 2000,
      activePlanId: 'pro',
    })

    renderNavWithQuery(
      <GlobalNav
        authState="authenticated"
        user={{ name: 'Subscriber', email: 'subscriber@example.com' }}
      />,
    )

    const planBtn = await screen.findByTestId('topnav-upgrade')
    expect(planBtn).toBeTruthy()
    expect(await screen.findByText('Pro')).toBeTruthy()
  })

  it('uses parent flex gap without margin hack classes', () => {
    const { container } = renderNavWithQuery(
      <GlobalNav
        authState="authenticated"
        user={{ name: 'Test User', email: 'test@example.com' }}
        planId="free"
      />,
    )

    const rootNav = container.firstElementChild as HTMLElement
    expect(rootNav).toBeTruthy()
    // Must use parent gap
    expect(rootNav.className).toContain('gap-2.5')

    // Must not have ml-1 margin hacks
    const planBtn = screen.getByTestId('topnav-upgrade')
    expect(planBtn.className).not.toContain('ml-1')
  })

  it('ensures sign-in button in unauthenticated state uses parent gap without ml-1', () => {
    renderNavWithQuery(<GlobalNav authState="unauthenticated" />)

    const signInBtn = screen.getByTestId('site-sign-in')
    expect(signInBtn).toBeTruthy()
    expect(signInBtn.className).not.toContain('ml-1')
  })
})
