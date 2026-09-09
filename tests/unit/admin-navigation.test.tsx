import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProfileMenu } from '../../src/components/layout/ProfileMenu'

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
  createFileRoute: () => (opts: { component: React.ComponentType }) => opts,
}))

vi.mock('../../src/lib/auth/auth-client', () => ({
  authClient: {
    signOut: vi.fn(),
  },
}))

describe('Admin Navigation in ProfileMenu', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not render Admin link when user has no role defined', async () => {
    render(
      <ProfileMenu
        user={{ name: 'Regular User', email: 'user@example.com' }}
      />,
    )

    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    await screen.findByTestId('profile-settings')
    expect(screen.queryByTestId('profile-admin')).toBeNull()
  })

  it('does not render Admin link when user role is not admin', async () => {
    render(
      <ProfileMenu
        user={{
          name: 'Regular User',
          email: 'user@example.com',
          role: 'user',
        }}
      />,
    )

    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    await screen.findByTestId('profile-settings')
    expect(screen.queryByTestId('profile-admin')).toBeNull()
  })

  it('renders Admin link pointing to /admin when user role is admin', async () => {
    render(
      <ProfileMenu
        user={{
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
        }}
      />,
    )

    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    const adminLink = await screen.findByTestId('profile-admin')
    expect(adminLink).toBeTruthy()
    expect(adminLink.getAttribute('href')).toBe('/admin')
  })

  it('places Admin link strictly below Pengaturan', async () => {
    render(
      <ProfileMenu
        user={{
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
        }}
      />,
    )

    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    const adminLink = await screen.findByTestId('profile-admin')
    const settingsLink = await screen.findByTestId('profile-settings')
    const content = settingsLink.parentElement

    expect(content).toBeTruthy()
    const children = Array.from(content?.children ?? [])
    const settingsIndex = children.indexOf(settingsLink)
    const adminIndex = children.indexOf(adminLink)

    expect(settingsIndex).toBeGreaterThanOrEqual(0)
    expect(adminIndex).toBe(settingsIndex + 1)
  })
})

describe('Banned Route Landing Page', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders banned account card and handles sign out', async () => {
    const { BannedPage } = await import('../../src/routes/banned')
    const { authClient } = await import('../../src/lib/auth/auth-client')

    render(<BannedPage />)

    const supportLink = screen.getByTestId('banned-contact-support')
    expect(supportLink.getAttribute('href')).toBe('mailto:support@zona.ai')

    const signOutBtn = screen.getByTestId('banned-sign-out')
    fireEvent.click(signOutBtn)

    expect(authClient.signOut).toHaveBeenCalled()
  })
})
