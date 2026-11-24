import {
  Cancel01Icon,
  Clock01Icon,
  Delete02Icon,
  Loading03Icon,
  Logout01Icon,
  MoreVerticalIcon,
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
import { useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { authClient } from '../../lib/auth/auth-client'
import type { ModelCatalogEntry } from '../../lib/models/types'
import { CONVERSATIONS_PAGE_SIZE } from '../../lib/utils/constants'
import {
  createConversation,
  deleteConversation,
  getConversations,
  updateConversation,
} from '../../server/functions/conversations'
import { findCatalogEntry, useModelCatalog } from '../chat/useModelCatalog'
import { BrandLogo } from '../ui/BrandLogo'
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
import { ProviderIcon } from '../ui/ProviderIcons'
import { CreditWidget } from './CreditWidget'

function getModelDisplayInfo(
  catalog: ModelCatalogEntry[],
  modelId: string,
): { provider: string; displayName: string } {
  const entry = findCatalogEntry(catalog, modelId)
  return {
    provider: entry?.provider ?? 'zona-router',
    displayName: entry?.displayName ?? modelId,
  }
}

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
  user?: { name?: string | null; email?: string | null } | null
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
  credits = 0,
  onNewChat,
  onSelectConversation,
  activeConversationId,
  mobileOpen = false,
  onMobileClose,
  collapsed = false,
  onToggleCollapse,
  user,
}: Props) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const catalog = useModelCatalog()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    title: string
  } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const editingInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!actionError) return
    const timer = window.setTimeout(() => setActionError(null), 4000)
    return () => window.clearTimeout(timer)
  }, [actionError])

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
      setActionError('Gagal mengubah nama percakapan. Coba lagi.')
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  })

  const navigate = useNavigate()

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteConversation({ data: { id } }),
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
      setActionError('Gagal menghapus percakapan. Coba lagi.')
    },
    onSuccess: (_data, deletedId) => {
      if (deletedId === activeConversationId) void navigate({ to: '/' })
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
  const currentUser = session?.user ?? user
  const userInitials = currentUser?.name
    ? currentUser.name
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
      className={`${mobileOpen ? 'fixed z-50' : 'hidden'} inset-y-0 left-0 flex h-screen h-[100dvh] shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width] duration-200 lg:sticky lg:z-30 lg:flex ${
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
              <BrandLogo
                data-testid="brand-mark"
                alt="ZonaAI"
                size={32}
                className="h-8 w-8"
              />
              <span className="min-w-0 flex-1 flex-col">
                <span className="block text-[15px] font-bold tracking-[-0.02em] text-ink">
                  ZonaAI
                </span>
                <span className="block text-[11px] text-stone">
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
              <button
                type="button"
                data-testid="sidebar-mobile-close"
                aria-label="Tutup sidebar"
                onClick={onMobileClose}
                className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink lg:hidden"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
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
          className={`mt-4 flex min-h-[42px] w-full items-center gap-2.5 rounded-md bg-accent text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-accent-hover disabled:cursor-wait disabled:opacity-60 ${
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

      <div className="zona-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {actionError && !collapsed && (
          <div
            role="alert"
            className="mb-2 flex items-center justify-between rounded-md border border-red-200 bg-red-50 p-2 text-[12px] text-red-600"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="ml-2 text-red-400 hover:text-red-700"
              aria-label="Tutup pesan error"
            >
              ×
            </button>
          </div>
        )}
        {!collapsed && (
          <>
            <p className="px-2.5 pb-2 text-[10px] font-bold tracking-[0.11em] text-stone uppercase">
              Terbaru
            </p>
            {conversationsQuery.isPending ? (
              <div className="space-y-2" role="status">
                <span className="sr-only">Memuat percakapan</span>
                {[0, 1, 2].map((item) => (
                  <div
                    key={item}
                    className="h-14 animate-pulse rounded-md bg-paper motion-reduce:animate-none"
                  />
                ))}
              </div>
            ) : conversationsQuery.isError ? (
              <p className="rounded-md border border-hairline p-3 text-[13px] text-stone">
                Gagal memuat percakapan.
              </p>
            ) : conversationItems.length === 0 ? (
              <div className="rounded-md border border-hairline bg-pure-white p-4 text-center">
                <p className="text-[13px] font-medium text-ink">
                  {debouncedSearch
                    ? 'No results found'
                    : 'Belum ada percakapan'}
                </p>
                {!debouncedSearch && (
                  <p className="mt-1 text-[12px] text-stone">
                    Mulai chat baru untuk melihat riwayat di sini.
                  </p>
                )}
              </div>
            ) : (
              <nav aria-label="Riwayat percakapan" className="space-y-0.5">
                {conversationItems.map((conversation) => {
                  const rawModelIds =
                    'modelIds' in conversation &&
                    Array.isArray(conversation.modelIds)
                      ? conversation.modelIds
                      : conversation.modelId
                        ? [conversation.modelId]
                        : []
                  const uniqueModelIds = Array.from(
                    new Set(
                      rawModelIds.filter(
                        (id): id is string =>
                          typeof id === 'string' && id.length > 0,
                      ),
                    ),
                  )
                  const visibleModelIds = uniqueModelIds.slice(0, 3)

                  return (
                    <div
                      key={conversation.id}
                      className={`group flex items-center rounded-md transition-colors duration-200 ${
                        activeConversationId === conversation.id
                          ? 'bg-pure-white shadow-[inset_0_0_0_1px_var(--color-hairline)]'
                          : 'hover:bg-ink/5'
                      }`}
                    >
                      {editingId === conversation.id ? (
                        <input
                          ref={editingInputRef}
                          aria-label={`Ubah nama ${conversation.title ?? 'Percakapan baru'}`}
                          value={editTitle}
                          maxLength={100}
                          onChange={(event) => setEditTitle(event.target.value)}
                          onBlur={() => submitRename(conversation.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter')
                              submitRename(conversation.id)
                            if (event.key === 'Escape') setEditingId(null)
                          }}
                          className="m-1 min-w-0 flex-1 rounded-md border border-hairline bg-pure-white px-2 py-1 text-[13px] text-ink outline-none focus-visible:border-notion-blue"
                        />
                      ) : (
                        <button
                          type="button"
                          title={conversation.title ?? 'Percakapan baru'}
                          onMouseEnter={() => {
                            void router.preloadRoute({
                              to: '/chat/$conversationId',
                              params: { conversationId: conversation.id },
                            })
                          }}
                          onClick={() => {
                            onMobileClose?.()
                            if (onSelectConversation)
                              onSelectConversation(conversation.id)
                            else
                              window.location.assign(`/chat/${conversation.id}`)
                          }}
                          className="grid min-w-0 flex-1 grid-cols-[38px_minmax(0,1fr)] items-center gap-2.5 px-2.5 py-1.5 text-left"
                        >
                          <div
                            data-testid={`conversation-slot-${conversation.id}`}
                            className="flex h-[18px] w-[38px] shrink-0 items-center justify-center"
                          >
                            {visibleModelIds.length > 0 && (
                              <div
                                data-testid={`conversation-model-icons-${conversation.id}`}
                                className="flex shrink-0 items-center -space-x-2"
                              >
                                {visibleModelIds.map((modelId, index) => {
                                  const { provider, displayName } =
                                    getModelDisplayInfo(catalog, modelId)
                                  return (
                                    <span
                                      key={modelId}
                                      data-testid={`conversation-model-icon-${modelId}`}
                                      title={displayName}
                                      style={{ zIndex: index + 1 }}
                                      className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-pure-white bg-paper text-ink ring-1 ring-hairline"
                                    >
                                      <ProviderIcon
                                        provider={provider}
                                        size={11}
                                      />
                                    </span>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col items-start">
                            <span className="w-full truncate text-[13px] font-medium leading-[1.3] text-ink/80 group-hover:text-ink">
                              {conversation.title ?? 'Percakapan baru'}
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
                          </div>
                        </button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            aria-label={`Menu ${conversation.title ?? 'Percakapan baru'}`}
                            className="mr-1 rounded-md p-1.5 text-stone opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 not-hover:opacity-100"
                          >
                            <HugeiconsIcon
                              icon={MoreVerticalIcon}
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
                                setEditTitle(
                                  conversation.title ?? 'Percakapan baru',
                                )
                              })
                            }}
                          >
                            <HugeiconsIcon
                              icon={PencilEdit01Icon}
                              size={14}
                              strokeWidth={1.75}
                              className="mr-2"
                              aria-hidden="true"
                            />
                            Ubah nama
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() =>
                              setDeleteTarget({
                                id: conversation.id,
                                title: conversation.title ?? 'Percakapan baru',
                              })
                            }
                            className="text-coral focus:text-coral"
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              size={14}
                              strokeWidth={1.75}
                              className="mr-2"
                              aria-hidden="true"
                            />
                            Hapus
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )
                })}
              </nav>
            )}
            {conversationsQuery.hasNextPage && (
              <button
                type="button"
                onClick={() => void conversationsQuery.fetchNextPage()}
                disabled={conversationsQuery.isFetchingNextPage}
                className="mt-3 w-full rounded-md border border-hairline px-3 py-2 text-[12px] text-ink/60 hover:bg-ink/5"
              >
                {conversationsQuery.isFetchingNextPage
                  ? 'Memuat...'
                  : 'Muat lainnya'}
              </button>
            )}
          </>
        )}
      </div>

      <div className="border-t border-hairline bg-sidebar">
        {!collapsed && <CreditWidget credits={credits} user={currentUser} />}
        <div
          className={
            collapsed ? 'p-2' : 'border-t border-hairline px-3.5 py-2.5'
          }
        >
          {collapsed ? (
            <button
              type="button"
              data-testid="sidebar-logout"
              title="Keluar"
              aria-label="Keluar"
              onClick={() => {
                void authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => window.location.assign('/auth/sign-in'),
                  },
                })
              }}
              className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-stone transition-colors duration-200 hover:bg-danger-soft hover:text-coral active:scale-95"
            >
              <HugeiconsIcon
                icon={Logout01Icon}
                size={18}
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
                  {currentUser?.name ?? 'Pengguna'}
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-stone transition-colors duration-200 hover:bg-danger-soft hover:text-coral active:scale-95"
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
