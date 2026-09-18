import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorView } from '../../src/components/layout/ErrorView'
import { NotFoundView } from '../../src/components/layout/NotFoundView'

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

describe('NotFoundView and ErrorView Components', () => {
  afterEach(() => {
    cleanup()
  })

  describe('NotFoundView', () => {
    it('renders big 404, natural copy, and single CTA back to ZonaAI', () => {
      render(<NotFoundView />)

      expect(screen.getByTestId('not-found-page')).toBeDefined()
      expect(screen.getByText('404')).toBeDefined()
      expect(screen.getByText('Halaman ini tidak ditemukan.')).toBeDefined()
      expect(
        screen.getByText(
          'Mungkin link-nya sudah berubah atau alamat yang kamu buka salah.',
        ),
      ).toBeDefined()

      const homeLink = screen.getByRole('link', {
        name: /kembali ke zonaai/i,
      })
      expect(homeLink.getAttribute('href')).toBe('/')
    })
  })

  describe('ErrorView', () => {
    it('renders 500 system error view with retry and workspace links', () => {
      const resetMock = vi.fn()
      render(
        <ErrorView error={new Error('Database timeout')} reset={resetMock} />,
      )

      expect(screen.getByTestId('error-boundary-page')).toBeDefined()
      expect(screen.getByText(/500/i)).toBeDefined()
      expect(screen.getByText('Terjadi Kesalahan')).toBeDefined()

      const retryButton = screen.getByRole('button', { name: /coba lagi/i })
      fireEvent.click(retryButton)
      expect(resetMock).toHaveBeenCalledTimes(1)

      const homeLink = screen.getByRole('link', {
        name: /kembali ke workspace/i,
      })
      expect(homeLink.getAttribute('href')).toBe('/')
    })

    it('renders 403 forbidden access denied view when error has 403 status', () => {
      const forbiddenError = { status: 403, message: 'Akses ditolak.' }
      render(<ErrorView error={forbiddenError} />)

      expect(screen.getByTestId('error-boundary-page')).toBeDefined()
      expect(screen.getByText('403')).toBeDefined()
      expect(screen.getByText('Akses Dibatasi')).toBeDefined()
      expect(
        screen.getByText('Akun ini tidak memiliki akses ke area admin.'),
      ).toBeDefined()

      expect(screen.queryByRole('button', { name: /coba lagi/i })).toBeNull()

      const homeLink = screen.getByRole('link', {
        name: /kembali ke workspace/i,
      })
      expect(homeLink.getAttribute('href')).toBe('/')

      // No 'ganti akun' prompt
      expect(screen.queryByText(/ganti akun/i)).toBeNull()
    })
  })
})
