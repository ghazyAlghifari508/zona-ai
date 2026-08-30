import {
  GitCompareIcon,
  Login03Icon,
  Menu01Icon,
  MessageAdd01Icon,
  Search01Icon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { Sidebar } from './Sidebar'

type Props = {
  children: React.ReactNode
  credits?: number
  onNewChat?: () => void
  onSelectConversation?: (id: string) => void
  activeConversationId?: string
  guest?: boolean
  onSignIn?: () => void
  signingIn?: boolean
}

export function WorkspaceShell({
  children,
  credits = 85,
  onNewChat,
  onSelectConversation,
  activeConversationId,
  guest = false,
  onSignIn,
  signingIn = false,
}: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  return (
    <div className="flex h-screen overflow-hidden bg-pure-white">
      <button
        type="button"
        data-testid="hamburger"
        aria-label={sidebarOpen ? 'Tutup sidebar' : 'Buka sidebar'}
        aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen((v) => !v)}
        className="fixed top-3 left-3 z-40 flex h-10 w-10 items-center justify-center rounded-full border border-hairline bg-pure-white text-ink lg:hidden"
      >
        <HugeiconsIcon
          icon={Menu01Icon}
          size={18}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {guest ? (
        <aside
          data-testid="guest-sidebar"
          className={`${sidebarOpen ? 'fixed' : 'hidden'} inset-y-0 left-0 z-30 flex h-screen shrink-0 flex-col border-r border-hairline bg-sidebar transition-[width] duration-200 lg:sticky lg:flex ${
            collapsed ? 'w-[76px]' : 'w-[280px]'
          }`}
        >
          <div className="flex h-full flex-col p-3">
            <div
              className={`flex items-center ${
                collapsed ? 'justify-center' : 'gap-2'
              }`}
            >
              {!collapsed ? (
                <>
                  <span
                    data-testid="brand-mark"
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[13px] font-extrabold tracking-[-0.04em] text-notion-blue"
                  >
                    ZA
                  </span>
                  <span className="min-w-0 flex-1 flex-col">
                    <span className="block text-[15px] font-bold tracking-[-0.02em] text-ink">
                      ZonaAI
                    </span>
                    <span className="block text-[11px] text-graphite">
                      Your intelligent space
                    </span>
                  </span>
                  <button
                    type="button"
                    data-testid="sidebar-collapse"
                    aria-label="Perkecil sidebar"
                    onClick={() => setCollapsed((v) => !v)}
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
                  onClick={() => setCollapsed((v) => !v)}
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
              data-testid="guest-new-chat"
              onClick={() => {
                setSidebarOpen(false)
                onNewChat?.()
              }}
              className={`mt-4 flex min-h-[42px] w-full items-center gap-2.5 rounded-md bg-notion-blue text-[13px] font-semibold text-pure-white transition-colors duration-200 hover:bg-blue-hover ${
                collapsed ? 'justify-center px-0' : 'px-3'
              }`}
            >
              <HugeiconsIcon
                icon={MessageAdd01Icon}
                size={17}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              {!collapsed && 'Chat baru'}
            </button>
            {!collapsed && (
              <>
                <div className="mt-5 flex-1">
                  <p className="px-2.5 pb-2 text-[10px] font-bold tracking-[0.11em] text-graphite uppercase">
                    Jelajahi
                  </p>
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={onNewChat}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
                    >
                      <HugeiconsIcon
                        icon={Search01Icon}
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Cari jawaban dengan AI
                    </button>
                    <button
                      type="button"
                      onClick={onSignIn}
                      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
                    >
                      <HugeiconsIcon
                        icon={GitCompareIcon}
                        size={16}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Bandingkan model
                    </button>
                  </div>
                </div>
                <div className="rounded-lg border border-hairline bg-pure-white p-4">
                  <p className="text-[14px] font-semibold text-ink">
                    Simpan percakapanmu
                  </p>
                  <p className="mt-1 text-[13px] leading-5 text-stone">
                    Masuk untuk membuka riwayat chat di perangkat mana pun.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="guest-sign-in"
                  onClick={onSignIn}
                  disabled={signingIn}
                  className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-notion-blue px-4 text-[14px] font-medium text-pure-white transition-colors duration-200 hover:bg-blue-hover disabled:opacity-60"
                >
                  <HugeiconsIcon
                    icon={Login03Icon}
                    size={16}
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                  {signingIn ? 'Menghubungkan...' : 'Masuk'}
                </button>
              </>
            )}
          </div>
        </aside>
      ) : (
        <Sidebar
          credits={credits}
          onNewChat={onNewChat}
          onSelectConversation={onSelectConversation}
          activeConversationId={activeConversationId}
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
        />
      )}
      <main className="min-w-0 flex-1 overflow-y-auto bg-pure-white p-4 lg:p-6">
        <div className="mx-auto h-full max-w-[920px] pt-12 lg:pt-0">
          {children}
        </div>
      </main>
    </div>
  )
}
