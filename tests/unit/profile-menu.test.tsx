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
}))

vi.mock('../../src/lib/auth/auth-client', () => ({
  authClient: {
    signOut: vi.fn(),
  },
}))

describe('ProfileMenu', () => {
  afterEach(cleanup)

  it('renders user initials when no image is provided', () => {
    render(<ProfileMenu user={{ name: 'Ghazy Alghifari', email: 'ghazy@example.com' }} />)

    const trigger = screen.getByTestId('profile-menu-trigger')
    expect(trigger.textContent).toBe('GA')
  })

  it('renders image when user has avatar url', () => {
    render(
      <ProfileMenu
        user={{
          name: 'Ghazy Alghifari',
          email: 'ghazy@example.com',
          image: 'https://example.com/avatar.jpg',
        }}
      />,
    )

    const trigger = screen.getByTestId('profile-menu-trigger')
    const img = trigger.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('src')).toBe('https://example.com/avatar.jpg')
  })

  it('links to /settings when Pengaturan is clicked', async () => {
    render(<ProfileMenu user={{ name: 'Ghazy Alghifari', email: 'ghazy@example.com' }} />)

    // Open dropdown
    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    const settingsLink = await screen.findByTestId('profile-settings')
    expect(settingsLink).toBeTruthy()
    expect(settingsLink.getAttribute('href')).toBe('/settings')
    expect(settingsLink.textContent).toContain('Pengaturan')
  })

  it('calls authClient.signOut when Keluar is clicked', async () => {
    const { authClient } = await import('../../src/lib/auth/auth-client')
    render(<ProfileMenu user={{ name: 'Ghazy Alghifari', email: 'ghazy@example.com' }} />)

    // Open dropdown
    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    const signOutBtn = await screen.findByTestId('profile-sign-out')
    fireEvent.click(signOutBtn)

    expect(authClient.signOut).toHaveBeenCalled()
  })
})

