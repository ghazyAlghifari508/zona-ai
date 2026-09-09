import { Cancel01Icon, Menu01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import { BrandLogo } from '../ui/BrandLogo'
import { AdminSidebar } from './AdminSidebar'

interface AdminShellProps {
  children: React.ReactNode
}

export function AdminShell({ children }: AdminShellProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('zona_admin_sidebar_collapsed') === 'true'
    }
    return false
  })

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        localStorage.setItem('zona_admin_sidebar_collapsed', String(next))
      }
      return next
    })
  }

  return (
    <div
      data-testid="admin-shell"
      className="flex min-h-screen bg-white text-ink"
    >
      {/* Desktop Sidebar with smooth collapse transition */}
      <div
        className={`hidden md:fixed md:inset-y-0 md:flex md:shrink-0 transition-all duration-300 ease-in-out z-20 ${
          isCollapsed ? 'md:w-[68px]' : 'md:w-64'
        }`}
      >
        <AdminSidebar
          collapsed={isCollapsed}
          onToggleCollapse={handleToggleCollapse}
        />
      </div>

      {/* Main Content Area: pure white with left padding adjusting smoothly */}
      <div
        className={`flex flex-1 flex-col bg-white transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:pl-[68px]' : 'md:pl-64'
        }`}
      >
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-hairline bg-white/95 px-4 backdrop-blur-md md:hidden">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              data-testid="admin-mobile-menu-toggle"
              onClick={() => setMobileMenuOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-hairline bg-pure-white text-stone transition-colors hover:bg-stone/10 hover:text-ink focus:outline-none focus:ring-1 focus:ring-ink/20"
              aria-label="Buka menu navigasi"
            >
              <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={1.75} />
            </button>
            <div className="flex items-center gap-2">
              <BrandLogo size={20} />
              <span className="text-[14px] font-semibold tracking-tight text-ink">
                Admin Panel
              </span>
            </div>
          </div>
          <span className="rounded border border-coral/30 bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-coral uppercase">
            ADMIN
          </span>
        </header>

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
            <div className="relative flex w-64 max-w-[80vw] flex-1 flex-col border-r border-hairline bg-paper shadow-xs">
              <div className="absolute top-2 right-2 z-10">
                <button
                  type="button"
                  data-testid="admin-mobile-drawer-close"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline bg-pure-white text-stone transition-colors hover:text-ink"
                  aria-label="Tutup menu navigasi"
                >
                  <HugeiconsIcon
                    icon={Cancel01Icon}
                    size={16}
                    strokeWidth={1.75}
                  />
                </button>
              </div>
              <AdminSidebar onClose={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        <main className="flex-1 bg-white p-4 md:p-8">
          <div className="mx-auto max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
