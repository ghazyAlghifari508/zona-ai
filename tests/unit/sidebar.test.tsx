import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sidebar } from '../../src/components/layout/Sidebar'

const serverMocks = vi.hoisted(() => ({
  createConversation: vi.fn(),
  getConversations: vi.fn(),
}))

vi.mock('../../src/server/functions/conversations', () => ({
  createConversation: serverMocks.createConversation,
  getConversations: serverMocks.getConversations,
  updateConversation: vi.fn(),
  deleteConversation: vi.fn(),
  archiveConversation: vi.fn(),
}))

vi.mock('../../src/lib/auth/auth-client', () => ({
  authClient: { signOut: vi.fn() },
}))

vi.mock('../../src/components/layout/CreditWidget', () => ({
  CreditWidget: () => null,
}))

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Sidebar />
    </QueryClientProvider>,
  )
}

describe('Sidebar persistence', () => {
  afterEach(cleanup)

  beforeEach(() => {
    vi.clearAllMocks()
    serverMocks.getConversations.mockResolvedValue({
      conversations: [],
      nextCursor: undefined,
    } as never)
  })

  it('loads the empty state and debounces server search', async () => {
    renderSidebar()
    expect(await screen.findByText('Belum ada percakapan')).toBeTruthy()

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Alpha' },
    })
    await waitFor(
      () =>
        expect(serverMocks.getConversations).toHaveBeenLastCalledWith({
          data: {
            cursor: undefined,
            includeArchived: false,
            limit: 20,
            search: 'Alpha',
          },
        }),
      { timeout: 500 },
    )
  })

  it('creates a conversation and delegates navigation', async () => {
    serverMocks.createConversation.mockResolvedValue({
      id: '10000000-0000-4000-8000-000000000010',
    } as never)
    const onSelectConversation = vi.fn()
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar onSelectConversation={onSelectConversation} />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'New Chat' }))
    await waitFor(() =>
      expect(onSelectConversation).toHaveBeenCalledWith(
        '10000000-0000-4000-8000-000000000010',
      ),
    )
  })
})
