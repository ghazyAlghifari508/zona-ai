import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import {
  Archive,
  Bot,
  LoaderCircle,
  LogOut,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { authClient } from '../../lib/auth/auth-client'
import { CONVERSATIONS_PAGE_SIZE } from '../../lib/utils/constants'
import {
  archiveConversation,
  createConversation,
  deleteConversation,
  getConversations,
  updateConversation,
} from '../../server/functions/conversations'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { CreditWidget } from './CreditWidget'

type Props = {
  credits?: number
  onNewChat?: () => void
  onSelectConversation?: (id: string) => void
  activeConversationId?: string
  /** Mobile: visibility toggled by hamburger. On desktop (>=lg), always visible. */
  mobileOpen?: boolean
  onMobileClose?: () => void
}

type ConversationsCache = {
  pages: Array<Awaited<ReturnType<typeof getConversations>>>
  pageParams: unknown[]
}

function updateCachedConversation(
  cache: ConversationsCache | undefined,
  id: string,
  update: 'remove' | string,
) {
  if (!cache) return cache
  return {
    ...cache,
    pages: cache.pages.map((page) => ({
      ...page,
      conversations:
        update === 'remove'
          ? page.conversations.filter((conversation) => conversation.id !== id)
          : page.conversations.map((conversation) =>
              conversation.id === id
                ? { ...conversation, title: update }
                : conversation,
            ),
    })),
  }
}

export function Sidebar({
  credits = 85,
  onNewChat,
  onSelectConversation,
  activeConversationId,
  mobileOpen = false,
  onMobileClose,
}: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    title: string
  } | null>(null)
  const editingInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      200,
    )
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (editingId) editingInputRef.current?.focus()
  }, [editingId])

  const conversationsQuery = useInfiniteQuery({
    queryKey: ['conversations', debouncedSearch],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      getConversations({
        data: {
          cursor: pageParam,
          includeArchived: false,
          limit: CONVERSATIONS_PAGE_SIZE,
          search: debouncedSearch || undefined,
        },
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  })

  const createMutation = useMutation({
    mutationFn: () => createConversation({ data: { mode: 'normal' } }),
    onSuccess: (conversation) => {
      void queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (onSelectConversation) onSelectConversation(conversation.id)
      else window.location.assign(`/chat/${conversation.id}`)
    },
  })

  const renameMutation = useMutation({
    mutationFn: (data: { id: string; title: string }) =>
      updateConversation({ data }),
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] })
      const snapshots = queryClient.getQueriesData<ConversationsCache>({
        queryKey: ['conversations'],
      })
      queryClient.setQueriesData<ConversationsCache>(
        { queryKey: ['conversations'] },
        (cache) => updateCachedConversation(cache, id, title),
      )
      return { snapshots }
    },
    onError: (_error, _variables, context) => {
      for (const [key, cache] of context?.snapshots ?? [])
        queryClient.setQueryData(key, cache)
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveConversation({ data: { id } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] })
      const snapshots = queryClient.getQueriesData<ConversationsCache>({
        queryKey: ['conversations'],
      })
      queryClient.setQueriesData<ConversationsCache>(
        { queryKey: ['conversations'] },
        (cache) => updateCachedConversation(cache, id, 'remove'),
      )
      return { snapshots }
    },
    onError: (_error, _variables, context) => {
      for (const [key, cache] of context?.snapshots ?? [])
        queryClient.setQueryData(key, cache)
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      deleteConversation({ data: { id, hard: false } }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] })
      const snapshots = queryClient.getQueriesData<ConversationsCache>({
        queryKey: ['conversations'],
      })
      queryClient.setQueriesData<ConversationsCache>(
        { queryKey: ['conversations'] },
        (cache) => updateCachedConversation(cache, id, 'remove'),
      )
      setDeleteTarget(null)
      return { snapshots }
    },
    onError: (_error, _variables, context) => {
      for (const [key, cache] of context?.snapshots ?? [])
        queryClient.setQueryData(key, cache)
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  })

  const submitRename = (id: string) => {
    const title = editTitle.trim()
    setEditingId(null)
    if (title) renameMutation.mutate({ id, title })
  }

  const conversationItems =
    conversationsQuery.data?.pages.flatMap((page) => page.conversations) ?? []

  return (
    <aside
      data-testid="sidebar"
      className={`${mobileOpen ? 'fixed' : 'hidden'} inset-y-0 left-0 z-30 flex h-screen w-[280px] flex-col border-r border-hairline-mist bg-pure-white lg:sticky lg:flex`}
    >
      <div className="p-4">
        <div className="text-[15px] font-medium text-ink-black">Zona.ai</div>
        <button
          type="button"
          onClick={() => {
            onMobileClose?.()
            if (onNewChat) onNewChat()
            else createMutation.mutate()
          }}
          disabled={createMutation.isPending}
          data-testid="new-chat-button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-ink-black bg-pure-white px-4 py-2 text-[15px] font-medium text-ink-black hover:bg-sandstone disabled:cursor-wait disabled:text-stone-deep"
        >
          {createMutation.isPending ? (
            <LoaderCircle
              size={16}
              strokeWidth={1.75}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          )}
          New Chat
        </button>
        <label className="relative mt-4 block">
          <span className="sr-only">Cari percakapan</span>
          <Search
            size={14}
            strokeWidth={1.75}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-deep"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari percakapan..."
            className="w-full rounded-[10px] border border-hairline-mist bg-cream-paper py-2 pl-9 pr-3 text-[15px] text-ink-black outline-none placeholder:text-stone-deep focus-visible:border-ink-black"
          />
        </label>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {conversationsQuery.isPending ? (
          <div className="space-y-2" role="status">
            <span className="sr-only">Memuat percakapan</span>
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-14 animate-pulse rounded-[10px] bg-sandstone motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : conversationsQuery.isError ? (
          <p className="rounded-[10px] border border-hairline-mist p-3 text-[13px] text-stone-deep">
            Gagal memuat percakapan.
          </p>
        ) : conversationItems.length === 0 ? (
          <div className="rounded-[10px] border border-hairline-mist bg-pure-white p-4 text-center">
            <p className="text-[15px] font-medium text-ink-black">
              {debouncedSearch ? 'No results found' : 'Belum ada percakapan'}
            </p>
            {!debouncedSearch && (
              <p className="mt-1 text-[13px] text-stone-deep">
                Mulai chat baru untuk melihat riwayat di sini.
              </p>
            )}
          </div>
        ) : (
          <nav aria-label="Riwayat percakapan" className="space-y-1">
            {conversationItems.map((conversation) => (
              <div
                key={conversation.id}
                className={`group flex items-center rounded-[10px] hover:bg-sandstone ${
                  activeConversationId === conversation.id
                    ? 'border border-hairline-mist bg-sandstone'
                    : ''
                }`}
              >
                {editingId === conversation.id ? (
                  <input
                    ref={editingInputRef}
                    aria-label={`Rename ${conversation.title ?? 'New Chat'}`}
                    value={editTitle}
                    maxLength={100}
                    onChange={(event) => setEditTitle(event.target.value)}
                    onBlur={() => submitRename(conversation.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') submitRename(conversation.id)
                      if (event.key === 'Escape') setEditingId(null)
                    }}
                    className="m-1 min-w-0 flex-1 rounded-[10px] border border-ink-black bg-pure-white px-2 py-1 text-[15px] text-ink-black outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onMobileClose?.()
                      if (onSelectConversation)
                        onSelectConversation(conversation.id)
                      else window.location.assign(`/chat/${conversation.id}`)
                    }}
                    className="min-w-0 flex-1 px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-ink-black"
                  >
                    <span className="block truncate text-[15px] font-medium text-ink-black">
                      {conversation.title ?? 'New Chat'}
                    </span>
                    <span className="mt-1 flex items-center gap-1 text-[13px] text-stone-deep">
                      <Bot size={12} strokeWidth={1.75} aria-hidden="true" />
                      {conversation.updatedAt
                        ? new Date(conversation.updatedAt).toLocaleDateString(
                            'id-ID',
                          )
                        : ''}
                    </span>
                  </button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Menu ${conversation.title ?? 'New Chat'}`}
                      className="mr-1 rounded-[10px] p-2 text-stone-deep opacity-0 hover:text-ink-black focus:opacity-100 group-hover:opacity-100"
                    >
                      <MoreHorizontal
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => {
                        window.requestAnimationFrame(() => {
                          setEditingId(conversation.id)
                          setEditTitle(conversation.title ?? 'New Chat')
                        })
                      }}
                    >
                      <Pencil size={14} strokeWidth={1.75} aria-hidden="true" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => archiveMutation.mutate(conversation.id)}
                    >
                      <Archive
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Archive
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() =>
                        setDeleteTarget({
                          id: conversation.id,
                          title: conversation.title ?? 'New Chat',
                        })
                      }
                    >
                      <Trash size={14} strokeWidth={1.75} aria-hidden="true" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </nav>
        )}
        {conversationsQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => conversationsQuery.fetchNextPage()}
            disabled={conversationsQuery.isFetchingNextPage}
            className="mt-3 w-full rounded-full border border-hairline-mist px-3 py-2 text-[13px] text-ink-black hover:bg-sandstone disabled:text-stone-deep"
          >
            {conversationsQuery.isFetchingNextPage ? 'Memuat...' : 'Load more'}
          </button>
        )}
      </div>

      <CreditWidget credits={credits} />
      <div className="border-t border-hairline-mist p-4">
        <button
          type="button"
          onClick={() => authClient.signOut()}
          className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-[14px] text-stone-deep hover:bg-sandstone hover:text-ink-black"
        >
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
          Keluar
        </button>
      </div>
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent className="rounded-[50px]">
          <DialogHeader>
            <DialogTitle>Hapus percakapan?</DialogTitle>
            <DialogDescription>
              {deleteTarget?.title} akan dihapus dari daftar percakapan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Batal
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id)
              }}
              disabled={deleteMutation.isPending}
            >
              Hapus percakapan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}
