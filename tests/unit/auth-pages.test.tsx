import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route as SignInRoute } from '../../src/routes/auth/sign-in'
import { Route as SignUpRoute } from '../../src/routes/auth/sign-up'

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (opts: { component: React.ComponentType }) => opts,
  redirect: vi.fn(),
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
    getSession: vi.fn().mockResolvedValue({ data: null }),
    signIn: {
      social: vi.fn(),
    },
  },
}))

describe('Auth Pages Brand Logo Navigation', () => {
  afterEach(() => {
    cleanup()
  })

  it('sign-in page brand mark links to /', () => {
    const SignInComponent = SignInRoute.component as React.ComponentType
    render(<SignInComponent />)

    const homeLink = screen.getByRole('link', { name: /zona\.ai/i })
    expect(homeLink).toBeDefined()
    expect(homeLink.getAttribute('href')).toBe('/')
  })

  it('sign-up page brand mark links to /', () => {
    const SignUpComponent = SignUpRoute.component as React.ComponentType
    render(<SignUpComponent />)

    const homeLink = screen.getByRole('link', { name: /zona\.ai/i })
    expect(homeLink).toBeDefined()
    expect(homeLink.getAttribute('href')).toBe('/')
  })
})
