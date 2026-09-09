import { Copy01Icon, EyeIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { UserAvatar } from '../../components/ui/UserAvatar'
import type { AuditLogItem } from '../../server/core/admin-audit'
import { listAuditLogsFn } from '../../server/functions/admin-audit'

export const Route = createFileRoute('/admin/audit-log')({
  staleTime: 30_000,
  loader: async () => {
    const auditData = await listAuditLogsFn({
      data: { page: 1, limit: 20 },
    })
    return { auditData }
  },
  component: AdminAuditLogPage,
})

export interface AdminAuditLogViewProps {
  initialData: {
    items: AuditLogItem[]
    pagination: {
      total: number
      page: number
      limit: number
      totalPages: number
    }
  }
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
    second: '2-digit',
  }).format(d)
}

const COMMON_ACTIONS = [
  { value: 'all', label: 'Semua Aksi' },
  { value: 'user.ban', label: 'user.ban (Blokir Akun)' },
  { value: 'user.unban', label: 'user.unban (Buka Blokir)' },
  { value: 'model.enable', label: 'model.enable (Aktifkan Model)' },
  { value: 'model.disable', label: 'model.disable (Nonaktifkan Model)' },
  { value: 'credit.adjust', label: 'credit.adjust (Penyesuaian Kredit)' },
  { value: 'credit.reset', label: 'credit.reset (Reset Kredit Dev)' },
  {
    value: 'feedback.status_update',
    label: 'feedback.status_update (Update Feedback)',
  },
]

export function AdminAuditLogView({ initialData }: AdminAuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>(initialData.items)
  const [pagination, setPagination] = useState(initialData.pagination)
  const [actionFilter, setActionFilter] = useState('all')
  const [adminSearch, setAdminSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [selectedLogForMeta, setSelectedLogForMeta] =
    useState<AuditLogItem | null>(null)
  const [copiedMeta, setCopiedMeta] = useState(false)

  const fetchLogs = async (
    targetPage: number,
    targetAction: string,
    targetAdmin: string,
  ) => {
    setIsLoading(true)
    try {
      const res = await listAuditLogsFn({
        data: {
          page: targetPage,
          limit: pagination.limit,
          action: targetAction === 'all' ? null : targetAction,
          adminId: targetAdmin.trim() ? targetAdmin.trim() : null,
        },
      })
      setLogs(res.items)
      setPagination(res.pagination)
    } finally {
      setIsLoading(false)
    }
  }

  const handleActionChange = (newAction: string) => {
    setActionFilter(newAction)
    void fetchLogs(1, newAction, adminSearch)
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void fetchLogs(1, actionFilter, adminSearch)
  }

  const handleCopyMeta = () => {
    if (!selectedLogForMeta) return
    const json = JSON.stringify(selectedLogForMeta.metadata, null, 2)
    void navigator.clipboard.writeText(json)
    setCopiedMeta(true)
    setTimeout(() => setCopiedMeta(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          Log Audit Sistem
        </h1>
        <p className="mt-1 text-[13px] text-stone">
          Catatan kronologis dan terperinci mengenai setiap tindakan
          administratif yang dilakukan dalam sistem Zona.ai.
        </p>
      </div>

      {/* Filter and search toolbar */}
      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-pure-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            strokeWidth={1.75}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-stone"
          />
          <input
            type="text"
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            placeholder="Cari berdasarkan Admin ID..."
            className="h-9 w-full rounded-md border border-hairline bg-paper pr-3 pl-9 text-[13px] text-ink placeholder:text-stone focus:border-hairline-strong focus:bg-pure-white focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-stone">Aksi:</span>
          <select
            data-testid="admin-audit-action-filter"
            value={actionFilter}
            onChange={(e) => handleActionChange(e.target.value)}
            className="h-9 rounded-md border border-hairline bg-paper px-3 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
          >
            {COMMON_ACTIONS.map((act) => (
              <option key={act.value} value={act.value}>
                {act.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div
        data-testid="admin-audit-table"
        className="overflow-hidden rounded-lg border border-hairline bg-pure-white shadow-xs"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-hairline bg-paper text-[11px] font-semibold tracking-wider text-stone uppercase">
              <tr>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3">Administrator</th>
                <th className="px-4 py-3">Aksi</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Detail Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone">
                    {isLoading
                      ? 'Memuat log audit...'
                      : 'Tidak ada entri log yang ditemukan.'}
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr
                    key={log.id}
                    className="transition-colors hover:bg-paper/40"
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-stone font-mono">
                      {formatDate(log.createdAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          user={{
                            name: log.adminName || log.adminEmail,
                            image: log.adminImage,
                          }}
                          className="h-6 w-6 text-[10px]"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-ink text-[12px] truncate">
                            {log.adminName || log.adminEmail}
                          </p>
                          <p className="text-[10px] text-stone font-mono truncate">
                            {log.adminId}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="rounded bg-paper border border-hairline px-2 py-0.5 font-mono text-[11px] font-medium text-ink">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-[12px]">
                        <span className="font-semibold text-ink uppercase text-[10px] rounded bg-stone/10 px-1 py-0.5 mr-1.5">
                          {log.targetType}
                        </span>
                        <span className="font-mono text-stone text-[11px]">
                          {log.targetId}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {log.metadata ? (
                        <button
                          type="button"
                          onClick={() => setSelectedLogForMeta(log)}
                          className="inline-flex items-center gap-1 text-[12px] text-notion-blue hover:underline font-mono"
                        >
                          <HugeiconsIcon
                            icon={EyeIcon}
                            size={14}
                            strokeWidth={1.75}
                          />
                          <span>Lihat JSON</span>
                        </button>
                      ) : (
                        <span className="text-[12px] text-stone">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-hairline bg-paper px-4 py-3 text-[12px] text-stone">
          <span>
            Menampilkan {logs.length} dari {pagination.total} rekaman audit
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1 || isLoading}
              onClick={() =>
                fetchLogs(pagination.page - 1, actionFilter, adminSearch)
              }
              className="rounded border border-hairline bg-pure-white px-2.5 py-1 text-ink disabled:opacity-40 hover:bg-stone/5"
            >
              Sebelumnya
            </button>
            <span>
              Halaman {pagination.page} dari {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={pagination.page >= pagination.totalPages || isLoading}
              onClick={() =>
                fetchLogs(pagination.page + 1, actionFilter, adminSearch)
              }
              className="rounded border border-hairline bg-pure-white px-2.5 py-1 text-ink disabled:opacity-40 hover:bg-stone/5"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>

      {/* Metadata JSON Viewer Dialog */}
      <Dialog
        open={selectedLogForMeta !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLogForMeta(null)
            setCopiedMeta(false)
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Detail Metadata Log Audit
            </DialogTitle>
            <DialogDescription className="text-[12px] text-stone font-mono">
              Aksi: {selectedLogForMeta?.action} | Target:{' '}
              {selectedLogForMeta?.targetType}
            </DialogDescription>
          </DialogHeader>

          {selectedLogForMeta && (
            <div className="relative mt-2">
              <pre className="max-h-96 overflow-auto rounded-md border border-hairline bg-paper p-4 font-mono text-[12px] text-ink leading-relaxed">
                {JSON.stringify(selectedLogForMeta.metadata, null, 2)}
              </pre>
            </div>
          )}

          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={handleCopyMeta}
              className="flex items-center gap-1.5 rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-stone/5"
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
              <span>{copiedMeta ? 'Tersalin!' : 'Salin JSON'}</span>
            </button>
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-md bg-paper px-3 py-1.5 text-[13px] font-medium text-stone hover:bg-stone/10"
              >
                Tutup
              </button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdminAuditLogPage() {
  const loaderData = Route.useLoaderData()
  return <AdminAuditLogView initialData={loaderData.auditData} />
}
