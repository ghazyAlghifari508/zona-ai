import {
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
import { AdminActivityChart } from '../../components/admin/AdminActivityChart'
import type { AdminDashboardMetrics } from '../../server/core/admin-dashboard'
import { getAdminDashboardMetricsFn } from '../../server/functions/admin-dashboard'

export const Route = createFileRoute('/admin/')({
  staleTime: 30_000,
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
      desc: 'Terdaftar',
      icon: UserGroupIcon,
    },
    {
      id: 'active-users',
      testId: 'admin-metric-active-users',
      title: 'Pengguna Aktif',
      value: formatNumber(data.activeUsers),
      desc: 'Aktif',
      icon: UserCheck01Icon,
    },
    {
      id: 'banned-users',
      testId: 'admin-metric-banned-users',
      title: 'Pengguna Diblokir',
      value: formatNumber(data.bannedUsers),
      desc: data.bannedUsers > 0 ? 'Ditangguhkan' : 'Nihil',
      isWarning: data.bannedUsers > 0,
      icon: UserRemove01Icon,
    },
    {
      id: 'new-feedback',
      testId: 'admin-metric-new-feedback',
      title: 'Feedback Baru',
      value: formatNumber(data.newFeedbackCount),
      desc: data.newFeedbackCount > 0 ? 'Perlu respon' : 'Nihil',
      isAttention: data.newFeedbackCount > 0,
      icon: Message01Icon,
    },
    {
      id: 'disabled-models',
      testId: 'admin-metric-disabled-models',
      title: 'Model Nonaktif',
      value: formatNumber(data.disabledModelsCount),
      desc: 'Pemeliharaan',
      icon: CpuIcon,
    },
    {
      id: 'total-credits',
      testId: 'admin-metric-total-credits',
      title: 'Kredit Beredar',
      value: formatNumber(data.totalCreditsInCirculation),
      desc: 'Saldo pengguna',
      icon: Coins01Icon,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold tracking-tight text-ink">
            Ringkasan Administrasi
          </h1>
          <p className="mt-0.5 text-xs text-stone">
            Aktivitas pengguna, metrik ekosistem, dan log audit real-time.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {metricCards.map((card) => (
          <div
            key={card.id}
            data-testid={card.testId}
            className="flex flex-col justify-between rounded-lg border border-hairline bg-pure-white p-3 transition-colors hover:border-hairline-strong"
          >
            <div className="flex items-center justify-between gap-1 text-stone">
              <span className="truncate text-[11px] font-medium tracking-wider uppercase text-stone">
                {card.title}
              </span>
              <HugeiconsIcon
                icon={card.icon}
                size={13}
                strokeWidth={1.75}
                className="shrink-0 text-stone/60"
                aria-hidden="true"
              />
            </div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-bold tracking-tight text-ink">
                {card.value}
              </span>
              {card.desc && (
                <span
                  className={`text-[10px] font-medium ${
                    card.isWarning
                      ? 'text-coral'
                      : card.isAttention
                        ? 'text-marigold'
                        : 'text-stone/70'
                  }`}
                >
                  {card.desc}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <AdminActivityChart data={data.chartData ?? []} />

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
