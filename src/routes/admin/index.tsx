import {
  Clock01Icon,
  Coins01Icon,
  CpuIcon,
  EyeIcon,
  Message01Icon,
  SecurityCheckIcon,
  UserCheck01Icon,
  UserGroupIcon,
  UserRemove01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { AdminDashboardMetrics } from '../../server/core/admin-dashboard'
import { getAdminDashboardMetricsFn } from '../../server/functions/admin-dashboard'

export const Route = createFileRoute('/admin/')({
  loader: async () => {
    return getAdminDashboardMetricsFn()
  },
  component: AdminDashboardPage,
})

function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num)
}

function formatDate(date: Date | string | null): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

interface AdminDashboardOverviewProps {
  data: AdminDashboardMetrics
}

export function AdminDashboardOverview({ data }: AdminDashboardOverviewProps) {
  const metricCards = [
    {
      id: 'total-users',
      testId: 'admin-metric-total-users',
      title: 'Total Pengguna',
      value: formatNumber(data.totalUsers),
      desc: 'Semua akun terdaftar',
      icon: UserGroupIcon,
      color: 'text-notion-blue',
      bg: 'bg-sky-tint',
    },
    {
      id: 'active-users',
      testId: 'admin-metric-active-users',
      title: 'Pengguna Aktif',
      value: formatNumber(data.activeUsers),
      desc: 'Akun dengan status aktif',
      icon: UserCheck01Icon,
      color: 'text-success',
      bg: 'bg-success/10',
    },
    {
      id: 'banned-users',
      testId: 'admin-metric-banned-users',
      title: 'Pengguna Diblokir',
      value: formatNumber(data.bannedUsers),
      desc: 'Akun ditangguhkan',
      icon: UserRemove01Icon,
      color: 'text-coral',
      bg: 'bg-danger-soft',
    },
    {
      id: 'new-feedback',
      testId: 'admin-metric-new-feedback',
      title: 'Feedback Baru',
      value: formatNumber(data.newFeedbackCount),
      desc: 'Menunggu respon admin',
      icon: Message01Icon,
      color: 'text-marigold',
      bg: 'bg-warning-soft',
    },
    {
      id: 'disabled-models',
      testId: 'admin-metric-disabled-models',
      title: 'Model Nonaktif',
      value: formatNumber(data.disabledModelsCount),
      desc: 'Model dalam pemeliharaan',
      icon: CpuIcon,
      color: 'text-stone',
      bg: 'bg-stone/10',
    },
    {
      id: 'total-credits',
      testId: 'admin-metric-total-credits',
      title: 'Total Kredit Beredar',
      value: formatNumber(data.totalCreditsInCirculation),
      desc: 'Akumulasi saldo pengguna',
      icon: Coins01Icon,
      color: 'text-notion-blue',
      bg: 'bg-sky-tint',
    },
  ]

  const quickActions = [
    {
      title: 'Kelola Pengguna',
      desc: 'Cari, tinjau, atau blokir akun',
      to: '/admin/users',
      icon: UserGroupIcon,
    },
    {
      title: 'Konfigurasi Model',
      desc: 'Atur ketersediaan model AI',
      to: '/admin/models',
      icon: CpuIcon,
    },
    {
      title: 'Kotak Masuk Feedback',
      desc: 'Tanggapi saran dan laporan bug',
      to: '/admin/feedback',
      icon: Message01Icon,
    },
    {
      title: 'Atur Saldo Kredit',
      desc: 'Penyesuaian manual kredit pengguna',
      to: '/admin/credits',
      icon: Coins01Icon,
    },
    {
      title: 'Buka Log Audit',
      desc: 'Rekam jejak tindakan administrator',
      to: '/admin/audit-log',
      icon: Clock01Icon,
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          Ringkasan Administrasi
        </h1>
        <p className="mt-1 text-[13px] text-stone">
          Pantau status ekosistem, aktivitas pengguna, dan metrik sistem secara
          real-time.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {metricCards.map((card) => (
          <div
            key={card.id}
            data-testid={card.testId}
            className="flex flex-col justify-between rounded-lg border border-hairline bg-pure-white p-5 shadow-xs"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[12px] font-medium tracking-wider text-stone uppercase">
                  {card.title}
                </p>
                <h3 className="mt-2 text-[28px] font-bold tracking-tight text-ink">
                  {card.value}
                </h3>
              </div>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${card.bg} ${card.color}`}
              >
                <HugeiconsIcon
                  icon={card.icon}
                  size={20}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </div>
            </div>
            <p className="mt-4 text-[12px] text-stone">{card.desc}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink">Aksi Cepat</h2>
        <div
          data-testid="admin-quick-shortcuts"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5"
        >
          {quickActions.map((action) => (
            <Link
              key={action.to}
              to={action.to}
              className="group flex flex-col rounded-lg border border-hairline bg-pure-white p-4 transition-all hover:border-hairline-strong hover:bg-stone/5"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md bg-paper text-ink transition-colors group-hover:bg-pure-white">
                <HugeiconsIcon
                  icon={action.icon}
                  size={18}
                  strokeWidth={1.75}
                />
              </div>
              <span className="mt-3 text-[13px] font-medium text-ink">
                {action.title}
              </span>
              <span className="mt-1 text-[11px] text-stone">{action.desc}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">
            Aktivitas Terkini (Log Audit)
          </h2>
          <Link
            to="/admin/audit-log"
            className="flex items-center gap-1 text-[12px] font-medium text-notion-blue hover:underline"
          >
            <span>Lihat semua</span>
            <HugeiconsIcon icon={EyeIcon} size={14} strokeWidth={1.75} />
          </Link>
        </div>

        <div
          data-testid="admin-recent-audit-feed"
          className="overflow-hidden rounded-lg border border-hairline bg-pure-white shadow-xs"
        >
          {data.recentAuditLogs.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-stone">
              Belum ada riwayat aktivitas log audit.
            </div>
          ) : (
            <div className="divide-y divide-hairline overflow-x-auto">
              {data.recentAuditLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between gap-4 p-4 text-[13px] transition-colors hover:bg-paper/40"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-stone">
                      <HugeiconsIcon
                        icon={SecurityCheckIcon}
                        size={16}
                        strokeWidth={1.75}
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink truncate">
                          {log.adminName || log.adminEmail}
                        </span>
                        <span className="rounded bg-paper px-2 py-0.5 font-mono text-[11px] text-stone">
                          {log.action}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-stone truncate">
                        Target: {log.targetType} ({log.targetId})
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right text-[11px] text-stone whitespace-nowrap">
                    {formatDate(log.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AdminDashboardPage() {
  const data = Route.useLoaderData()
  return <AdminDashboardOverview data={data} />
}
