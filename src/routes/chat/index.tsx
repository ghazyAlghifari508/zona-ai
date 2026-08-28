import { createFileRoute, redirect } from '@tanstack/react-router'
import { WorkspaceShell } from '@/components/layout/WorkspaceShell'
import { getCurrentSession } from '@/server/functions/session'

export const Route = createFileRoute('/chat/')({
  beforeLoad: async () => {
    try {
      await getCurrentSession()
    } catch {
      throw redirect({ to: '/auth/sign-in' })
    }
  },
  component: ChatPlaceholder,
})

function ChatPlaceholder() {
  const navigate = Route.useNavigate()
  return (
    <WorkspaceShell
      onSelectConversation={(conversationId) => {
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId },
        })
      }}
    >
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="font-medium text-[30px] text-ink-black">
            Tanyakan apa saja ke Zona.ai
          </h2>
          <p className="mt-2 text-[15px] text-stone-gray">
            Pilih model, tulis pertanyaan, atau buka percakapan sebelumnya.
          </p>
        </div>
      </div>
    </WorkspaceShell>
  )
}
