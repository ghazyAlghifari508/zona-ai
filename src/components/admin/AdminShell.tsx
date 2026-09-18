import { Cancel01Icon, Menu01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { AdminSidebar } from './AdminSidebar'

interface AdminShellProps {
  children: React.ReactNode
}

export function AdminShell({ children }: AdminShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div
      data-testid="admin-shell"
      className="flex min-h-screen min-h-dvh flex-col bg-[#fcfbf9] text-ink dark:bg-[#121212]"
    >
      <AdminSidebar />

      {/* Floating Mobile Menu Button */}
      <div className="fixed right-4 bottom-4 z-30 md:hidden">
        <button
          type="button"
          data-testid="admin-mobile-menu-toggle"
          onClick={() => setMobileMenuOpen(true)}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline bg-pure-white text-ink shadow-md transition-colors hover:bg-paper focus:outline-none focus:ring-2 focus:ring-notion-blue dark:bg-zinc-900"
          aria-label="Buka menu navigasi admin"
        >
          <HugeiconsIcon icon={Menu01Icon} size={20} strokeWidth={1.75} />
        </button>
      </div>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          data-testid="admin-mobile-drawer"
          className="fixed inset-0 z-50 flex md:hidden"
        >
          <button
            type="button"
            aria-label="Tutup overlay navigasi"
            className="fixed inset-0 bg-ink/30 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative flex w-72 max-w-[85vw] flex-1 flex-col border-r border-hairline bg-pure-white shadow-lg dark:bg-[#161616]">
            <div className="absolute top-3 right-3 z-10">
              <button
                type="button"
                data-testid="admin-mobile-drawer-close"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-paper text-stone transition-colors hover:text-ink dark:bg-zinc-800"
                aria-label="Tutup menu navigasi"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={16}
                  strokeWidth={1.75}
                />
              </button>
            </div>
            <AdminSidebar
              layout="drawer"
              onClose={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Main Expansive Content Workspace */}
      <main className="flex-1 px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  )
}
