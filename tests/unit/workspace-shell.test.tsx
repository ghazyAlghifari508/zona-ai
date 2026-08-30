import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkspaceShell } from '../../src/components/layout/WorkspaceShell'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('../../src/server/functions/conversations', () => ({
  getConversations: vi.fn().mockResolvedValue({
    conversations: [],
    nextCursor: undefined,
  }),
  createConversation: vi.fn(),
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
}))

vi.mock('../../src/lib/auth/auth-client', () => ({
  authClient: {
    useSession: vi.fn().mockReturnValue({ data: null, isPending: true }),
    signOut: vi.fn(),
  },
}))

vi.mock('../../src/components/layout/CreditWidget', () => ({
  CreditWidget: () => null,
}))

function renderShell(props: Parameters<typeof WorkspaceShell>[0]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <WorkspaceShell {...props} />
    </QueryClientProvider>,
  )
}

describe('WorkspaceShell authState handling', () => {
  afterEach(cleanup)

  it('renders loading-sidebar and NEVER guest-sidebar when authState is loading', () => {
    renderShell({
      authState: 'loading',
      children: <div>Content</div>,
    })

    expect(screen.getByTestId('loading-sidebar')).toBeDefined()
    expect(screen.queryByTestId('guest-sidebar')).toBeNull()
    expect(screen.queryByTestId('guest-sign-in')).toBeNull()
    expect(screen.queryByText('Simpan percakapanmu')).toBeNull()
    expect(screen.queryByTestId('sidebar')).toBeNull()
  })

  it('renders guest-sidebar when authState is unauthenticated', () => {
    renderShell({
      authState: 'unauthenticated',
      children: <div>Content</div>,
    })

    expect(screen.getByTestId('guest-sidebar')).toBeDefined()
    expect(screen.getByTestId('guest-sign-in')).toBeDefined()
    expect(screen.getByText('Simpan percakapanmu')).toBeDefined()
    expect(screen.queryByTestId('loading-sidebar')).toBeNull()
    expect(screen.queryByTestId('sidebar')).toBeNull()
  })

  it('renders authenticated sidebar when authState is authenticated', () => {
    renderShell({
      authState: 'authenticated',
      children: <div>Content</div>,
    })

    expect(screen.getByTestId('sidebar')).toBeDefined()
    expect(screen.queryByTestId('guest-sidebar')).toBeNull()
    expect(screen.queryByTestId('loading-sidebar')).toBeNull()
  })

  it('falls back to guest prop when authState is omitted', () => {
    renderShell({
      guest: true,
      children: <div>Content</div>,
    })

    expect(screen.getByTestId('guest-sidebar')).toBeDefined()
    expect(screen.queryByTestId('sidebar')).toBeNull()
  })
})
