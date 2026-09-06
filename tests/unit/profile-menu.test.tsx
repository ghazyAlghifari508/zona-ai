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

import {
  resetThemeForTesting,
  setTheme,
} from '../../src/lib/ui/theme'

describe('ProfileMenu', () => {
  afterEach(() => {
    cleanup()
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    resetThemeForTesting()
  })

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

  it('places the Tampilan toggle directly above Keluar', async () => {
    render(<ProfileMenu user={{ name: 'Ghazy Alghifari', email: 'ghazy@example.com' }} />)

    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    await screen.findByTestId('profile-theme-toggle')
    const content = trigger.ownerDocument.querySelector(
      '[data-testid="profile-theme-toggle"]',
    )?.parentElement
    expect(content).toBeTruthy()
    const toggle = content?.querySelector('[data-testid="profile-theme-toggle"]')
    const signOut = content?.querySelector('[data-testid="profile-sign-out"]')
    expect(toggle && signOut
      ? (Array.from(content?.children ?? []).indexOf(toggle as Element) <
          Array.from(content?.children ?? []).indexOf(signOut as Element))
      : false).toBe(true)
  })

  it('toggles dark mode in place without unmounting the menu', async () => {
    render(<ProfileMenu user={{ name: 'Ghazy Alghifari', email: 'ghazy@example.com' }} />)

    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    const toggle = await screen.findByTestId('profile-theme-toggle')
    expect(screen.getByTestId('profile-theme-state').textContent).toBe('Terang')
    expect(document.documentElement.classList.contains('dark')).toBe(false)

    fireEvent.click(toggle)
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(screen.getByTestId('profile-theme-state').textContent).toBe('Gelap')
    expect(screen.getByTestId('profile-theme-toggle')).toBeTruthy()

    fireEvent.click(toggle)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(screen.getByTestId('profile-theme-state').textContent).toBe('Terang')
  })

  it('shows the dark state label when theme starts dark', async () => {
    setTheme('dark')
    render(<ProfileMenu user={{ name: 'Ghazy Alghifari', email: 'ghazy@example.com' }} />)

    const trigger = screen.getByTestId('profile-menu-trigger')
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })

    await screen.findByTestId('profile-theme-toggle')
    expect(screen.getByTestId('profile-theme-state').textContent).toBe('Gelap')
  })
})

