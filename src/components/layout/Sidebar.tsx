import {
  ArchiveIcon,
  Clock01Icon,
  Delete02Icon,
  Loading03Icon,
  Logout01Icon,
  Message01Icon,
  MoreHorizontalIcon,
  PencilEdit01Icon,
  PlusSignIcon,
  Search01Icon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
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
  collapsed?: boolean
  onToggleCollapse?: () => void
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
  collapsed = false,
  onToggleCollapse,
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

  const sessionQuery = authClient.useSession?.()
  const session = sessionQuery?.data
  const userInitials = session?.user?.name
    ? session.user.name
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'U'

  return (
    <aside
      data-testid="sidebar"
      className={`${mobileOpen ? 'fixed' : 'hidden'} inset-y-0 left-0 z-30 flex h-screen shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width] duration-200 lg:sticky lg:flex ${
        collapsed ? 'w-[76px]' : 'w-[280px]'
      }`}
    >
      <div className="flex shrink-0 flex-col p-3">
        <div
          className={`flex items-center ${
            collapsed ? 'justify-center' : 'gap-2'
          }`}
        >
          {!collapsed ? (
            <>
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[13px] font-extrabold tracking-[-0.04em] text-notion-blue">
                ZA
              </span>
              <span className="min-w-0 flex-1 flex-col">
                <span className="block text-[15px] font-bold tracking-[-0.02em] text-ink">
                  ZonaAI
                </span>
                <span className="block text-[11px] text-ink/40">
                  Your intelligent space
                </span>
              </span>
              <button
                type="button"
                data-testid="sidebar-collapse"
                aria-label="Perkecil sidebar"
                onClick={onToggleCollapse}
                className="ml-auto hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink lg:flex"
              >
                <HugeiconsIcon
                  icon={SidebarLeft01Icon}
                  size={18}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="sidebar-collapse"
              aria-label="Perbesar sidebar"
              onClick={onToggleCollapse}
              className="flex h-9 w-9 items-center justify-center rounded-md text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
            >
              <HugeiconsIcon
                icon={SidebarRight01Icon}
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            onMobileClose?.()
            if (onNewChat) onNewChat()
            else createMutation.mutate()
          }}
          disabled={createMutation.isPending}
          data-testid="new-chat-button"
          className={`mt-4 flex min-h-[42px] w-full items-center gap-2.5 rounded-md bg-notion-blue text-[13px] font-semibold text-pure-white transition-colors duration-200 hover:bg-blue-hover disabled:cursor-wait disabled:opacity-60 ${
            collapsed ? 'justify-center px-0' : 'px-3'
          }`}
        >
          {createMutation.isPending ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              size={16}
              strokeWidth={1.75}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <HugeiconsIcon
              icon={PlusSignIcon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          )}
          {!collapsed && 'Chat baru'}
        </button>
        {!collapsed && (
          <label className="relative mt-2 block">
            <span className="sr-only">Cari percakapan</span>
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Cari percakapan..."
              className="w-full rounded-md border border-hairline bg-pure-white py-2 pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-stone focus-visible:border-notion-blue"
            />
          </label>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {!collapsed && (
          <p className="px-2.5 pb-2 text-[10px] font-bold tracking-[0.11em] text-ink/40 uppercase">
            Recent
          </p>
        )}
        {conversationsQuery.isPending ? (
          !collapsed ? (
            <div className="space-y-2" role="status">
              <span className="sr-only">Memuat percakapan</span>
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="h-14 animate-pulse rounded-md bg-paper motion-reduce:animate-none"
                />
              ))}
            </div>
          ) : null
        ) : conversationsQuery.isError ? (
          !collapsed ? (
            <p className="rounded-md border border-hairline p-3 text-[13px] text-stone">
              Gagal memuat percakapan.
            </p>
          ) : null
        ) : conversationItems.length === 0 ? (
          !collapsed ? (
            <div className="rounded-md border border-hairline bg-pure-white p-4 text-center">
              <p className="text-[13px] font-medium text-ink">
                {debouncedSearch ? 'No results found' : 'Belum ada percakapan'}
              </p>
              {!debouncedSearch && (
                <p className="mt-1 text-[12px] text-stone">
                  Mulai chat baru untuk melihat riwayat di sini.
                </p>
              )}
            </div>
          ) : null
        ) : (
          <nav aria-label="Riwayat percakapan" className="space-y-0.5">
            {conversationItems.map((conversation) => (
              <div
                key={conversation.id}
                className={`group flex items-center rounded-md transition-colors duration-200 ${
                  activeConversationId === conversation.id
                    ? 'bg-pure-white shadow-[inset_0_0_0_1px_var(--color-hairline)]'
                    : 'hover:bg-ink/5'
                }`}
              >
                {editingId === conversation.id && !collapsed ? (
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
                    className="m-1 min-w-0 flex-1 rounded-md border border-hairline bg-pure-white px-2 py-1 text-[13px] text-ink outline-none focus-visible:border-notion-blue"
                  />
                ) : (
                  <button
                    type="button"
                    title={conversation.title ?? 'New Chat'}
                    onClick={() => {
                      onMobileClose?.()
                      if (onSelectConversation)
                        onSelectConversation(conversation.id)
                      else window.location.assign(`/chat/${conversation.id}`)
                    }}
                    className={
                      collapsed
                        ? 'flex w-full items-center justify-center p-2'
                        : 'flex min-w-0 flex-1 flex-col items-start px-2.5 py-1.5 text-left'
                    }
                  >
                    {collapsed ? (
                      <HugeiconsIcon
                        icon={Message01Icon}
                        size={16}
                        strokeWidth={1.75}
                        className="text-ink/60"
                        aria-hidden="true"
                      />
                    ) : (
                      <>
                        <span className="w-full truncate text-[13px] font-medium leading-[1.3] text-ink/80 group-hover:text-ink">
                          {conversation.title ?? 'New Chat'}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone">
                          <HugeiconsIcon
                            icon={Clock01Icon}
                            size={12}
                            strokeWidth={1.75}
                            className="shrink-0"
                            aria-hidden="true"
                          />
                          <span>
                            {conversation.updatedAt
                              ? new Date(
                                  conversation.updatedAt,
                                ).toLocaleDateString('id-ID')
                              : ''}
                          </span>
                        </span>
                      </>
                    )}
                  </button>
                )}
                {!collapsed && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Menu ${conversation.title ?? 'New Chat'}`}
                        className="mr-1 rounded-md p-1.5 text-stone opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                      >
                        <HugeiconsIcon
                          icon={MoreHorizontalIcon}
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
                        <HugeiconsIcon
                          icon={PencilEdit01Icon}
                          size={14}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => archiveMutation.mutate(conversation.id)}
                      >
                        <HugeiconsIcon
                          icon={ArchiveIcon}
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
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          size={14}
                          strokeWidth={1.75}
                          aria-hidden="true"
                        />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </nav>
        )}
        {!collapsed && conversationsQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => conversationsQuery.fetchNextPage()}
            disabled={conversationsQuery.isFetchingNextPage}
            className="mt-3 w-full rounded-md border border-hairline px-3 py-2 text-[12px] text-ink/60 hover:bg-ink/5"
          >
            {conversationsQuery.isFetchingNextPage ? 'Memuat...' : 'Load more'}
          </button>
        )}
      </div>

      <div className="border-t border-hairline bg-sidebar">
        {!collapsed && <CreditWidget credits={credits} />}
        <div
          className={`border-t border-hairline ${
            collapsed ? 'p-2' : 'px-3.5 py-2.5'
          }`}
        >
          {collapsed ? (
            <button
              type="button"
              data-testid="sidebar-logout"
              title="Keluar"
              onClick={() => {
                void authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => window.location.assign('/auth/sign-in'),
                  },
                })
              }}
              className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg text-stone transition-colors duration-200 hover:bg-rose-50 hover:text-coral active:scale-95"
            >
              <HugeiconsIcon
                icon={Logout01Icon}
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          ) : (
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-tint text-[13px] font-semibold text-notion-blue">
                {userInitials}
              </span>
              <span className="flex min-w-0 flex-1 flex-col overflow-hidden">
                <span className="truncate text-[13px] font-medium leading-[1.2] text-ink">
                  {session?.user?.name ?? 'Pengguna'}
                </span>
                <span className="mt-0.5 inline-flex items-center">
                  <span className="inline-flex h-4 items-center rounded bg-sandstone/50 px-1.5 text-[10.5px] font-medium text-stone">
                    Standar
                  </span>
                </span>
              </span>
              <button
                type="button"
                data-testid="sidebar-logout"
                title="Keluar"
                onClick={() => {
                  void authClient.signOut({
                    fetchOptions: {
                      onSuccess: () => window.location.assign('/auth/sign-in'),
                    },
                  })
                }}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone transition-colors duration-200 hover:bg-rose-50 hover:text-coral active:scale-95"
              >
                <HugeiconsIcon
                  icon={Logout01Icon}
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </div>
      </div>
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
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
              variant="destructive"
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
