import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Sidebar } from './Sidebar'

type Props = {
  children: React.ReactNode
  credits?: number
  onNewChat?: () => void
  onSelectConversation?: (id: string) => void
  activeConversationId?: string
}

export function WorkspaceShell({
  children,
  credits = 85,
  onNewChat,
  onSelectConversation,
  activeConversationId,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  return (
    <div className="flex min-h-screen bg-cream-paper">
      <button
        type="button"
        data-testid="hamburger"
        aria-label={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((v) => !v)}
        className="fixed top-3 left-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-hairline-mist bg-pure-white text-ink-black lg:hidden"
      >
        <Menu size={18} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <Sidebar
        credits={credits}
        onNewChat={onNewChat}
        onSelectConversation={onSelectConversation}
        activeConversationId={activeConversationId}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />
      <main className="flex-1 bg-cream-paper p-6 pb-[160px] lg:pl-6">
        <div className="mx-auto max-w-[800px] pt-12 lg:pt-0">{children}</div>
      </main>
    </div>
  )
}
