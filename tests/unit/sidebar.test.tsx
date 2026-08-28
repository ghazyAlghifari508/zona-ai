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
  archiveConversation: vi.fn(),
  createConversation: vi.fn(),
  deleteConversation: vi.fn(),
  getConversations: vi.fn(),
  updateConversation: vi.fn(),
}))

vi.mock('../../src/server/functions/conversations', () => ({
  createConversation: serverMocks.createConversation,
  getConversations: serverMocks.getConversations,
  updateConversation: serverMocks.updateConversation,
  deleteConversation: serverMocks.deleteConversation,
  archiveConversation: serverMocks.archiveConversation,
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

  it('archives immediately and confirms before soft delete', async () => {
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
    serverMocks.archiveConversation.mockResolvedValue({ success: true })
    serverMocks.deleteConversation.mockResolvedValue({ success: true })
    renderSidebar()

    fireEvent.pointerDown(
      await screen.findByRole('button', { name: 'Menu Disposable' }),
      { button: 0, ctrlKey: false },
    )
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive' }))
    await waitFor(() =>
      expect(serverMocks.archiveConversation).toHaveBeenCalledWith({
        data: { id },
      }),
    )

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
        data: { id, hard: false },
      }),
    )
  })
})
