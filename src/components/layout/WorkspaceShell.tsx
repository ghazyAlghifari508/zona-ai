import { Plus } from 'lucide-react'

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-cream-paper">
      <aside className="sticky top-0 flex h-screen w-[280px] flex-col border-r border-hairline-mist bg-pure-white p-4">
        <div className="text-[15px] font-medium text-ink-black">Zona.ai</div>
        <button
          type="button"
          className="mt-4 flex items-center gap-2 rounded-full border border-ink-black bg-pure-white px-4 py-2 text-[15px] font-medium text-ink-black hover:bg-sandstone"
        >
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          New Chat
        </button>
        <div className="mt-4 text-[13px] text-stone-gray">
          Workspace ready — Fase 02 akan isi daftar percakapan.
        </div>
      </aside>
      <main className="flex-1 bg-cream-paper p-6">
        <div className="mx-auto max-w-[800px]">{children}</div>
      </main>
    </div>
  )
}
