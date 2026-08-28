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
  return (
    <div className="flex min-h-screen bg-cream-paper">
      <Sidebar
        credits={credits}
        onNewChat={onNewChat}
        onSelectConversation={onSelectConversation}
        activeConversationId={activeConversationId}
      />
      <main className="flex-1 bg-cream-paper p-6 pb-[140px]">
        <div className="mx-auto max-w-[800px]">{children}</div>
      </main>
    </div>
  )
}
