import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UserAvatar } from '../../src/components/ui/UserAvatar'

describe('UserAvatar component', () => {
  afterEach(cleanup)

  it('renders initials when user has no image', () => {
    render(
      <UserAvatar
        user={{ name: 'Ghazy Alghifari', email: 'user@example.com' }}
      />,
    )

    expect(screen.getByText('GA')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('renders fallback ZA when name is missing and has no image', () => {
    render(<UserAvatar user={null} />)

    expect(screen.getByText('ZA')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('renders initials when user image is empty or whitespace', () => {
    render(<UserAvatar user={{ name: 'Budi Santoso', image: '   ' }} />)

    expect(screen.getByText('BS')).toBeTruthy()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('renders image with referrerPolicy no-referrer when image url is present', () => {
    render(
      <UserAvatar
        user={{
          name: 'Ghazy Alghifari',
          image: 'https://lh3.googleusercontent.com/a/photo.jpg',
        }}
      />,
    )

    const img = screen.getByRole('img') as HTMLImageElement
    expect(img).toBeTruthy()
    expect(img.src).toBe('https://lh3.googleusercontent.com/a/photo.jpg')
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer')
  })

  it('falls back to initials immediately when image fails to load', () => {
    render(
      <UserAvatar
        user={{
          name: 'Ghazy Alghifari',
          image: 'https://invalid-domain.com/broken-avatar.jpg',
        }}
      />,
    )

    const img = screen.getByRole('img')
    expect(img).toBeTruthy()

    // Simulate image error event
    fireEvent.error(img)

    // Image element should be unmounted and initials should be displayed
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('GA')).toBeTruthy()
  })
})
