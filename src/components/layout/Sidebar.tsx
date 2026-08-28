import { LogOut, Plus, Search } from 'lucide-react'
import { CreditWidget } from './CreditWidget'

type ConversationItem = {
  id: string
  title: string | null
}

type Props = {
  credits?: number
  conversations?: ConversationItem[]
  onNewChat?: () => void
  onSelectConversation?: (id: string) => void
  activeConversationId?: string
}

export function Sidebar({
  credits = 85,
  conversations = [],
  onNewChat,
  onSelectConversation,
  activeConversationId,
}: Props) {
  return (
    <aside className="sticky top-0 flex h-screen w-[280px] flex-col border-r border-hairline-mist bg-pure-white">
      <div className="p-4">
        <div className="text-[15px] font-medium text-ink-black">Zona.ai</div>
        <button
          type="button"
          onClick={onNewChat}
          data-testid="new-chat-button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-ink-black bg-pure-white px-4 py-2 text-[15px] font-medium text-ink-black hover:bg-sandstone"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          New Chat
        </button>
        <div className="mt-4 flex items-center gap-2 rounded-full border border-hairline-mist bg-cream-paper px-3 py-2 text-[13px] text-stone-gray">
          <Search size={14} strokeWidth={1.75} />
          <span>Cari percakapan...</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4">
        {conversations.length === 0 ? (
          <div className="mt-4 text-center text-[13px] text-stone-gray">
            Belum ada percakapan
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelectConversation?.(c.id)}
                data-testid={`conversation-${c.id}`}
                className={`w-full truncate rounded-[10px] px-3 py-2 text-left text-[14px] hover:bg-sandstone ${
                  activeConversationId === c.id
                    ? 'bg-cream-paper border border-hairline-mist'
                    : ''
                }`}
              >
                {c.title ?? 'Tanpa judul'}
              </button>
            ))}
          </div>
        )}
      </div>

      <CreditWidget credits={credits} />

      <div className="border-t border-hairline-mist p-4">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-[10px] px-3 py-2 text-[14px] text-stone-gray hover:bg-sandstone hover:text-ink-black"
        >
          <LogOut size={16} strokeWidth={1.75} />
          Keluar
        </button>
      </div>
    </aside>
  )
}
