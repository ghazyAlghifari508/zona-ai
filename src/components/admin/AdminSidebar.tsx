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
import { BrandLogo } from '../ui/BrandLogo'

interface AdminSidebarProps {
  onClose?: () => void
  className?: string
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

export function AdminSidebar({ onClose, className = '' }: AdminSidebarProps) {
  const handleNavClick = () => {
    if (onClose) {
      onClose()
    }
  }

  return (
    <aside
      data-testid="admin-sidebar"
      className={`flex h-full w-64 flex-col border-r border-hairline bg-paper select-none ${className}`}
    >
      <div className="flex h-14 items-center justify-between border-b border-hairline px-4">
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
        <span
          data-testid="admin-brand-badge"
          className="rounded border border-coral/30 bg-danger-soft px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-coral uppercase"
        >
          ADMIN
        </span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <div className="px-2 pb-2 text-[11px] font-semibold tracking-wider text-stone uppercase">
          Menu Administrasi
        </div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            data-testid={item.testId}
            onClick={handleNavClick}
            activeOptions={{ exact: item.exact }}
            activeProps={{
              className:
                'bg-pure-white text-ink font-semibold border border-hairline shadow-xs',
            }}
            inactiveProps={{
              className:
                'text-stone border border-transparent hover:bg-pure-white/70 hover:text-ink',
            }}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors"
          >
            <HugeiconsIcon
              icon={item.icon}
              size={17}
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
          className="flex items-center gap-2.5 rounded-md border border-hairline bg-pure-white px-3 py-2 text-[13px] font-medium text-stone transition-colors hover:bg-stone/10 hover:text-ink"
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
    </aside>
  )
}
