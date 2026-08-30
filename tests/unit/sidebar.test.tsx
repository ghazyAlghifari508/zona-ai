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
  deleteConversation: vi.fn(),
  getConversations: vi.fn(),
  updateConversation: vi.fn(),
}))

const routerMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => routerMocks.navigate,
}))

vi.mock('../../src/server/functions/conversations', () => ({
  createConversation: serverMocks.createConversation,
  getConversations: serverMocks.getConversations,
  updateConversation: serverMocks.updateConversation,
  deleteConversation: serverMocks.deleteConversation,
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

    fireEvent.click(screen.getByRole('button', { name: 'Chat baru' }))
    await waitFor(() =>
      expect(onSelectConversation).toHaveBeenCalledWith(
        '10000000-0000-4000-8000-000000000010',
      ),
    )
  })

  it('renames a conversation from its accessible menu', async () => {
    serverMocks.getConversations.mockResolvedValue({
      conversations: [
        {
          id: '10000000-0000-4000-8000-000000000011',
          title: 'Old title',
          updatedAt: new Date('2026-08-29T00:00:00Z'),
        },
      ],
      nextCursor: undefined,
    })
    serverMocks.updateConversation.mockResolvedValue({ title: 'New title' })
    renderSidebar()

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'Menu Old title' }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    const input = await screen.findByRole('textbox', {
      name: 'Rename Old title',
    })
    fireEvent.change(input, { target: { value: 'New title' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(serverMocks.updateConversation).toHaveBeenCalledWith({
        data: {
          id: '10000000-0000-4000-8000-000000000011',
          title: 'New title',
        },
      }),
    )
  })

  it('confirms before deleting a conversation', async () => {
    const id = '10000000-0000-4000-8000-000000000012'
    serverMocks.getConversations.mockResolvedValue({
      conversations: [
        {
          id,
          title: 'Disposable',
          updatedAt: new Date('2026-08-29T00:00:00Z'),
        },
      ],
      nextCursor: undefined,
    })
    serverMocks.deleteConversation.mockResolvedValue({ success: true })
    renderSidebar()

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'Menu Disposable' }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(serverMocks.deleteConversation).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Hapus percakapan' }))
    await waitFor(() =>
      expect(serverMocks.deleteConversation).toHaveBeenCalledWith({
        data: { id },
      }),
    )
  })

  it('navigates to home when the active conversation is deleted', async () => {
    const id = '10000000-0000-4000-8000-000000000013'
    serverMocks.getConversations.mockResolvedValue({
      conversations: [
        {
          id,
          title: 'Active thread',
          updatedAt: new Date('2026-08-29T00:00:00Z'),
        },
      ],
      nextCursor: undefined,
    })
    serverMocks.deleteConversation.mockResolvedValue({ success: true })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar activeConversationId={id} />
      </QueryClientProvider>,
    )

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'Menu Active thread' }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hapus percakapan' }))

    await waitFor(() =>
      expect(routerMocks.navigate).toHaveBeenCalledWith({ to: '/' }),
    )
  })

  it('stays on the conversation when a different one is deleted', async () => {
    serverMocks.getConversations.mockResolvedValue({
      conversations: [
        {
          id: '10000000-0000-4000-8000-000000000014',
          title: 'Other thread',
          updatedAt: new Date('2026-08-29T00:00:00Z'),
        },
      ],
      nextCursor: undefined,
    })
    serverMocks.deleteConversation.mockResolvedValue({ success: true })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar activeConversationId="10000000-0000-4000-8000-000000000099" />
      </QueryClientProvider>,
    )

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'Menu Other thread' }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hapus percakapan' }))

    await waitFor(() =>
      expect(serverMocks.deleteConversation).toHaveBeenCalledWith({
        data: { id: '10000000-0000-4000-8000-000000000014' },
      }),
    )
    expect(routerMocks.navigate).not.toHaveBeenCalled()
  })

  it('renders only toggle, new chat, and logout when collapsed', async () => {
    serverMocks.getConversations.mockResolvedValue({
      conversations: [
        {
          id: '10000000-0000-4000-8000-000000000020',
          title: 'Hidden Thread in Collapsed',
          updatedAt: new Date('2026-08-29T00:00:00Z'),
        },
      ],
      nextCursor: undefined,
    })

    const onToggleCollapse = vi.fn()
    const onNewChat = vi.fn()

    const { rerender } = render(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar
          collapsed={true}
          onToggleCollapse={onToggleCollapse}
          onNewChat={onNewChat}
        />
      </QueryClientProvider>,
    )

    // Essential collapsed items exist
    expect(screen.getByTestId('sidebar-collapse')).toBeTruthy()
    expect(screen.getByTestId('new-chat-button')).toBeTruthy()
    expect(screen.getByTestId('sidebar-logout')).toBeTruthy()

    // Non-collapsed items must NOT exist
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Riwayat percakapan' })).toBeNull()
    expect(screen.queryByText('Recent')).toBeNull()
    expect(screen.queryByText('Hidden Thread in Collapsed')).toBeNull()

    // When expanded back
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <Sidebar
          collapsed={false}
          onToggleCollapse={onToggleCollapse}
          onNewChat={onNewChat}
        />
      </QueryClientProvider>,
    )

    // Items re-appear
    expect(screen.getByRole('searchbox')).toBeTruthy()
    expect(await screen.findByText('Hidden Thread in Collapsed')).toBeTruthy()
  })
})

