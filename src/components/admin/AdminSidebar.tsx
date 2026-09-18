import {
  ArrowLeft01Icon,
  Clock01Icon,
  Coins01Icon,
  CpuIcon,
  DashboardSquare01Icon,
  Message01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'

interface AdminSidebarProps {
  onClose?: () => void
  className?: string
  layout?: 'top' | 'drawer'
}

export interface NavItem {
  name: string
  to: string
  icon: typeof DashboardSquare01Icon
  testId: string
  exact?: boolean
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
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
  layout = 'top',
}: AdminSidebarProps) {
  const handleNavClick = () => {
    if (onClose) {
      onClose()
    }
  }

  if (layout === 'drawer') {
    return (
      <div
        data-testid="admin-sidebar"
        className={`flex h-full flex-col bg-pure-white select-none dark:bg-[#161616] ${className}`}
      >
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ADMIN_NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              preload="intent"
              data-testid={item.testId}
              onClick={handleNavClick}
              activeOptions={{ exact: item.exact }}
              activeProps={{
                className:
                  'bg-paper text-ink font-semibold border border-hairline dark:bg-zinc-800',
              }}
              inactiveProps={{
                className:
                  'text-stone border border-transparent hover:bg-paper/60 hover:text-ink',
              }}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 font-medium text-[13px] transition-colors"
            >
              <HugeiconsIcon
                icon={item.icon}
                size={18}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0"
              />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        <div className="border-t border-hairline p-3">
          <Link
            to="/"
            data-testid="admin-back-workspace"
            onClick={handleNavClick}
            className="flex items-center gap-2.5 rounded-lg border border-hairline bg-paper px-3 py-2.5 font-medium text-[13px] text-stone transition-colors hover:text-ink dark:bg-zinc-900"
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
              className="shrink-0"
            />
            <span>Kembali ke Workspace</span>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <header
      data-testid="admin-sidebar"
      className={`sticky top-0 z-40 w-full border-b border-hairline bg-pure-white/95 select-none backdrop-blur-md dark:bg-[#141414]/95 ${className}`}
    >
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <nav className="no-scrollbar hidden min-w-0 items-center gap-0.5 overflow-x-auto md:flex">
          {ADMIN_NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              preload="intent"
              data-testid={item.testId}
              onClick={handleNavClick}
              activeOptions={{ exact: item.exact }}
              activeProps={{
                className:
                  'bg-paper text-ink font-semibold border border-hairline dark:bg-zinc-800',
              }}
              inactiveProps={{
                className:
                  'text-stone border border-transparent hover:bg-paper/70 hover:text-ink dark:hover:bg-zinc-800/50',
              }}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium text-[13px] transition-colors lg:px-3"
            >
              <HugeiconsIcon
                icon={item.icon}
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
                className="shrink-0"
              />
              <span>{item.name}</span>
            </Link>
          ))}
        </nav>

        <Link
          to="/"
          data-testid="admin-back-workspace"
          onClick={handleNavClick}
          className="ml-auto inline-flex shrink-0 items-center gap-2 rounded-md border border-hairline bg-pure-white px-3 py-1.5 font-medium text-[13px] text-stone transition-colors hover:bg-stone/5 hover:text-ink dark:bg-[#1a1a1a]"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            size={15}
            strokeWidth={1.75}
            aria-hidden="true"
            className="shrink-0"
          />
          <span>Kembali ke Workspace</span>
        </Link>
      </div>
    </header>
  )
}
