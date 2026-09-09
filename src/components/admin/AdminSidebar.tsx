import {
  ArrowLeft01Icon,
  Clock01Icon,
  Coins01Icon,
  CpuIcon,
  DashboardSquare01Icon,
  Message01Icon,
  SidebarLeft01Icon,
  SidebarRight01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { BrandLogo } from '../ui/BrandLogo'

interface AdminSidebarProps {
  onClose?: () => void
  className?: string
  collapsed?: boolean
  onToggleCollapse?: () => void
}

interface NavItem {
  name: string
  to: string
  icon: typeof DashboardSquare01Icon
  testId: string
  exact?: boolean
}

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Ringkasan',
    to: '/admin',
    icon: DashboardSquare01Icon,
    testId: 'admin-nav-overview',
    exact: true,
  },
  {
    name: 'Pengguna',
    to: '/admin/users',
    icon: UserGroupIcon,
    testId: 'admin-nav-users',
  },
  {
    name: 'Model AI',
    to: '/admin/models',
    icon: CpuIcon,
    testId: 'admin-nav-models',
  },
  {
    name: 'Feedback',
    to: '/admin/feedback',
    icon: Message01Icon,
    testId: 'admin-nav-feedback',
  },
  {
    name: 'Kredit',
    to: '/admin/credits',
    icon: Coins01Icon,
    testId: 'admin-nav-credits',
  },
  {
    name: 'Log Audit',
    to: '/admin/audit-log',
    icon: Clock01Icon,
    testId: 'admin-nav-audit-log',
  },
]

export function AdminSidebar({
  onClose,
  className = '',
  collapsed = false,
  onToggleCollapse,
}: AdminSidebarProps) {
  const handleNavClick = () => {
    if (onClose) {
      onClose()
    }
  }

  return (
    <aside
      data-testid="admin-sidebar"
      className={`flex h-full flex-col border-r border-hairline bg-paper select-none transition-all duration-300 ease-in-out ${
        collapsed ? 'w-[68px]' : 'w-64'
      } ${className}`}
    >
      {/* Header */}
      <div
        className={`flex h-14 items-center border-b border-hairline ${
          collapsed ? 'justify-center px-2' : 'justify-between px-3.5'
        }`}
      >
        {collapsed ? (
          <div className="flex flex-col items-center gap-1">
            {onToggleCollapse ? (
              <button
                type="button"
                data-testid="admin-sidebar-collapse-toggle"
                onClick={onToggleCollapse}
                aria-label="Perbesar sidebar"
                className="flex h-8 w-8 items-center justify-center rounded-md text-stone transition-colors hover:bg-stone/10 hover:text-ink"
                title="Buka sidebar"
              >
                <HugeiconsIcon
                  icon={SidebarRight01Icon}
                  size={18}
                  strokeWidth={1.75}
                />
              </button>
            ) : (
              <BrandLogo size={24} />
            )}
          </div>
        ) : (
          <>
            <Link
              to="/admin"
              onClick={handleNavClick}
              className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
            >
              <BrandLogo size={24} />
              <span className="text-[14px] font-semibold tracking-tight text-ink">
                Zona.ai
              </span>
            </Link>
            <div className="flex items-center gap-1.5">
              <span
                data-testid="admin-brand-badge"
                className="rounded border border-coral/30 bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-coral uppercase"
              >
                ADMIN
              </span>
              {onToggleCollapse && (
                <button
                  type="button"
                  data-testid="admin-sidebar-collapse-toggle"
                  onClick={onToggleCollapse}
                  aria-label="Perkecil sidebar"
                  className="hidden h-7 w-7 items-center justify-center rounded-md text-stone transition-colors hover:bg-stone/10 hover:text-ink md:flex"
                  title="Tutup sidebar"
                >
                  <HugeiconsIcon
                    icon={SidebarLeft01Icon}
                    size={16}
                    strokeWidth={1.75}
                  />
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={`flex-1 space-y-1 overflow-y-auto ${
          collapsed ? 'px-2 py-4' : 'px-3 py-4'
        }`}
      >
        {!collapsed ? (
          <div className="px-2 pb-2 text-[11px] font-semibold tracking-wider text-stone uppercase">
            Menu Administrasi
          </div>
        ) : (
          <div className="my-1 border-b border-hairline/60" />
        )}
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            data-testid={item.testId}
            onClick={handleNavClick}
            title={collapsed ? item.name : undefined}
            activeOptions={{ exact: item.exact }}
            activeProps={{
              className:
                'bg-pure-white text-ink font-semibold border border-hairline shadow-xs',
            }}
            inactiveProps={{
              className:
                'text-stone border border-transparent hover:bg-pure-white/70 hover:text-ink',
            }}
            className={`flex items-center rounded-md text-[13px] font-medium transition-colors ${
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-2.5 py-2'
            }`}
          >
            <HugeiconsIcon
              icon={item.icon}
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
              className="shrink-0"
            />
            {!collapsed && <span>{item.name}</span>}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className={`border-t border-hairline ${collapsed ? 'p-2' : 'p-3'}`}>
        <Link
          to="/"
          data-testid="admin-back-workspace"
          onClick={handleNavClick}
          title={collapsed ? 'Kembali ke Workspace' : undefined}
          className={`flex items-center rounded-md border border-hairline bg-pure-white text-[13px] font-medium text-stone transition-colors hover:bg-stone/10 hover:text-ink ${
            collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'
          }`}
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
            className="shrink-0"
          />
          {!collapsed && <span>Kembali ke Workspace</span>}
        </Link>
      </div>
    </aside>
  )
}
