import { createFileRoute, redirect } from '@tanstack/react-router'
import { WorkspaceShell } from '@/components/layout/WorkspaceShell'
import { authClient } from '@/lib/auth/auth-client'

export const Route = createFileRoute('/chat/')({
  beforeLoad: async () => {
    const { data } = await authClient.getSession()
    if (!data?.user) {
      throw redirect({ to: '/auth/sign-in' })
    }
  },
  component: ChatPlaceholder,
})

function ChatPlaceholder() {
  return (
    <WorkspaceShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="font-medium text-[30px] text-ink-black">
            Selamat datang di Zona.ai
          </h2>
          <p className="mt-2 text-[15px] text-stone-gray">
            Chat workspace akan hadir di Fase 03. Auth & DB siap.
          </p>
        </div>
      </div>
    </WorkspaceShell>
  )
}
