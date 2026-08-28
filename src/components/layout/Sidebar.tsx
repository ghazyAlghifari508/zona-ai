import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { Bot, LoaderCircle, LogOut, Plus, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { authClient } from '../../lib/auth/auth-client'
import { CONVERSATIONS_PAGE_SIZE } from '../../lib/utils/constants'
import {
  createConversation,
  getConversations,
} from '../../server/functions/conversations'
import { CreditWidget } from './CreditWidget'

type Props = {
  credits?: number
  onNewChat?: () => void
  onSelectConversation?: (id: string) => void
  activeConversationId?: string
}

export function Sidebar({
  credits = 85,
  onNewChat,
  onSelectConversation,
  activeConversationId,
}: Props) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      200,
    )
    return () => window.clearTimeout(timer)
  }, [search])

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

  const conversationItems =
    conversationsQuery.data?.pages.flatMap((page) => page.conversations) ?? []

  return (
    <aside className="sticky top-0 flex h-screen w-[280px] shrink-0 flex-col border-r border-hairline-mist bg-pure-white">
      <div className="p-4">
        <div className="text-[15px] font-medium text-ink-black">Zona.ai</div>
        <button
          type="button"
          onClick={() => {
            if (onNewChat) onNewChat()
            else createMutation.mutate()
          }}
          disabled={createMutation.isPending}
          data-testid="new-chat-button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-ink-black bg-pure-white px-4 py-2 text-[15px] font-medium text-ink-black hover:bg-sandstone disabled:cursor-wait disabled:text-stone-gray"
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
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-gray"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Cari percakapan..."
            className="w-full rounded-[10px] border border-hairline-mist bg-cream-paper py-2 pl-9 pr-3 text-[15px] text-ink-black outline-none placeholder:text-stone-gray focus-visible:border-ink-black"
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
          <p className="rounded-[10px] border border-hairline-mist p-3 text-[13px] text-stone-gray">
            Gagal memuat percakapan.
          </p>
        ) : conversationItems.length === 0 ? (
          <div className="rounded-[10px] border border-hairline-mist bg-pure-white p-4 text-center">
            <p className="text-[15px] font-medium text-ink-black">
              {debouncedSearch ? 'No results found' : 'Belum ada percakapan'}
            </p>
            {!debouncedSearch && (
              <p className="mt-1 text-[13px] text-stone-gray">
                Mulai chat baru untuk melihat riwayat di sini.
              </p>
            )}
          </div>
        ) : (
          <nav aria-label="Riwayat percakapan" className="space-y-1">
            {conversationItems.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                onClick={() => {
                  if (onSelectConversation)
                    onSelectConversation(conversation.id)
                  else window.location.assign(`/chat/${conversation.id}`)
                }}
                className={`w-full rounded-[10px] px-3 py-2 text-left hover:bg-sandstone focus-visible:outline-2 focus-visible:outline-ink-black ${
                  activeConversationId === conversation.id
                    ? 'border border-hairline-mist bg-sandstone'
                    : ''
                }`}
              >
                <span className="block truncate text-[15px] font-medium text-ink-black">
                  {conversation.title ?? 'New Chat'}
                </span>
                <span className="mt-1 flex items-center gap-1 text-[13px] text-stone-gray">
                  <Bot size={12} strokeWidth={1.75} aria-hidden="true" />
                  {conversation.updatedAt
                    ? new Date(conversation.updatedAt).toLocaleDateString(
                        'id-ID',
                      )
                    : ''}
                </span>
              </button>
            ))}
          </nav>
        )}
        {conversationsQuery.hasNextPage && (
          <button
            type="button"
            onClick={() => conversationsQuery.fetchNextPage()}
            disabled={conversationsQuery.isFetchingNextPage}
            className="mt-3 w-full rounded-full border border-hairline-mist px-3 py-2 text-[13px] text-ink-black hover:bg-sandstone disabled:text-stone-gray"
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
          className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-[14px] text-stone-gray hover:bg-sandstone hover:text-ink-black"
        >
          <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
          Keluar
        </button>
      </div>
    </aside>
  )
}
