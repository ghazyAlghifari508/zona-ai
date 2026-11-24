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
import { useRef, useState } from 'react'
import { AdminActivityChart } from '../../components/admin/AdminActivityChart'
import { TablePagination } from '../../components/admin/TablePagination'
import { presentAuditActivity } from '../../lib/admin/audit-activity'
import { ADMIN_ACTIVITY_PAGE_SIZE } from '../../lib/utils/constants'
import type { ListAuditLogsResponse } from '../../server/core/admin-audit'
import type { AdminDashboardMetrics } from '../../server/core/admin-dashboard'
import { listAuditLogsFn } from '../../server/functions/admin-audit'
import { getAdminDashboardMetricsFn } from '../../server/functions/admin-dashboard'
export const Route = createFileRoute('/admin/')({
  staleTime: 30_000,
  loader: async () => {
    const [data, audit] = await Promise.all([
      getAdminDashboardMetricsFn(),
      listAuditLogsFn({
        data: { page: 1, limit: ADMIN_ACTIVITY_PAGE_SIZE },
      }),
    ])
    return { data, audit }
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
  initialAudit: ListAuditLogsResponse
}

export function AdminDashboardOverview({
  data,
  initialAudit,
}: AdminDashboardOverviewProps) {
  const [audit, setAudit] = useState(initialAudit)
  const [isFetching, setIsFetching] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchAudit = async (page: number) => {
    const requestId = ++requestIdRef.current
    setIsFetching(true)
    setAuditError(null)
    try {
      const result = await listAuditLogsFn({
        data: { page, limit: ADMIN_ACTIVITY_PAGE_SIZE },
      })
      if (requestId !== requestIdRef.current) return
      setAudit(result)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setAuditError(
        error instanceof Error ? error.message : 'Gagal memuat aktivitas.',
      )
    } finally {
      if (requestId === requestIdRef.current) setIsFetching(false)
    }
  }
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
      icon: UserRemove01Icon,
    },
    {
      id: 'new-feedback',
      testId: 'admin-metric-new-feedback',
      title: 'Feedback Baru',
      value: formatNumber(data.newFeedbackCount),
      desc: data.newFeedbackCount > 0 ? 'Perlu respon' : 'Nihil',
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
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          Ringkasan Administrasi
        </h1>
        <p className="mt-1 text-[13px] text-stone">
          Aktivitas pengguna, metrik ekosistem, dan log audit real-time.
        </p>
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
                <span className="text-[10px] font-medium text-stone/70">
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
          <h2 className="text-[15px] font-semibold text-ink">Log Aktivitas</h2>
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
          {audit.items.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-stone">
              Belum ada riwayat aktivitas.
            </div>
          ) : (
            <div className="divide-y divide-hairline overflow-x-auto">
              {audit.items.map((log) => {
                const activity = presentAuditActivity({
                  action: log.action,
                  metadata: log.metadata,
                  metadataUnreadable: log.metadataUnreadable,
                  adminId: log.adminId,
                  adminEmail: log.adminEmail,
                  currentActorName: log.adminName,
                  targetId: log.targetId,
                  targetType: log.targetType,
                  currentTargetName: log.currentTargetName,
                })
                return (
                  <div
                    key={log.id}
                    data-testid={`admin-activity-row-${log.id}`}
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
                            {activity.actorLabel}
                          </span>
                          <span className="text-[11px] text-stone">
                            {activity.actionLabel}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[12px] text-stone truncate">
                          Target: {activity.targetLabel}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-[11px] text-stone whitespace-nowrap">
                      {formatDate(log.createdAt)}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {auditError && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 border-t border-hairline bg-danger-soft px-4 py-2.5 text-[13px] text-coral"
            >
              <span>{auditError}</span>
              <button
                type="button"
                onClick={() => void fetchAudit(audit.pagination.page)}
                className="font-medium underline"
              >
                Coba lagi
              </button>
            </div>
          )}
          <div className="border-t border-hairline">
            <TablePagination
              ariaLabel="Navigasi aktivitas"
              page={audit.pagination.page}
              totalPages={audit.pagination.totalPages}
              total={audit.pagination.total}
              pageSize={ADMIN_ACTIVITY_PAGE_SIZE}
              disabled={isFetching}
              onPageChange={(page) => void fetchAudit(page)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function AdminDashboardPage() {
  const { data, audit } = Route.useLoaderData()
  return <AdminDashboardOverview data={data} initialAudit={audit} />
}
