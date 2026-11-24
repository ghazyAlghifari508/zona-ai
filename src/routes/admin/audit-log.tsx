import { Copy01Icon, EyeIcon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import {
  Accordion,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from '../../components/ui/cnippet-accordion'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  NativeSelect,
  NativeSelectOption,
} from '../../components/ui/native-select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../components/ui/table'
import { UserAvatar } from '../../components/ui/UserAvatar'
import {
  AUDIT_ACTION_FILTER_OPTIONS,
  type AuditActionFilterValue,
  presentAuditActivity,
} from '../../lib/admin/audit-activity'
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

function presentLog(log: AuditLogItem) {
  return presentAuditActivity({
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
}

export function AdminAuditLogView({ initialData }: AdminAuditLogViewProps) {
  const [logs, setLogs] = useState<AuditLogItem[]>(initialData.items)
  const [pagination, setPagination] = useState(initialData.pagination)
  const [actionFilter, setActionFilter] =
    useState<AuditActionFilterValue>('all')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null)
  const [copied, setCopied] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    return () => {
      requestIdRef.current += 1
    }
  }, [])

  async function fetchLogs(
    targetPage: number,
    targetSearch: string,
    targetAction: AuditActionFilterValue,
  ) {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setError(null)
    try {
      const result = await listAuditLogsFn({
        data: {
          page: targetPage,
          limit: pagination.limit,
          search: targetSearch.trim() ? targetSearch.trim() : null,
          action: targetAction === 'all' ? null : targetAction,
        },
      })
      if (requestId !== requestIdRef.current) return
      setLogs(result.items)
      setPagination(result.pagination)
    } catch {
      if (requestId !== requestIdRef.current) return
      setError('Aktivitas tidak dapat dimuat. Silakan coba lagi.')
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false)
    }
  }

  function handleSearchSubmit(event: { preventDefault(): void }) {
    event.preventDefault()
    void fetchLogs(1, searchInput, actionFilter)
    setSearch(searchInput)
  }

  function handleActionChange(nextAction: string) {
    const action = AUDIT_ACTION_FILTER_OPTIONS.find(
      (option) => option.value === nextAction,
    )
    if (action === undefined) return
    setActionFilter(action.value)
    void fetchLogs(1, search, action.value)
  }

  function handleRetry() {
    void fetchLogs(pagination.page, search, actionFilter)
  }

  async function handleCopy() {
    if (selectedLog === null) return
    const json = JSON.stringify(presentLog(selectedLog).technical, null, 2)
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  const selectedPresentation =
    selectedLog === null ? null : presentLog(selectedLog)
  const page = Math.min(
    Math.max(1, pagination.page),
    Math.max(1, pagination.totalPages),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          Log Aktivitas
        </h1>
        <p className="mt-1 text-[13px] text-stone">
          Riwayat perubahan yang dilakukan administrator.
        </p>
      </div>

      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-pure-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            strokeWidth={1.75}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-stone"
          />
          <input
            data-testid="admin-audit-search"
            aria-label="Cari administrator atau target"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Cari administrator atau target..."
            className="h-9 w-full rounded-md border border-hairline bg-paper pr-3 pl-9 text-[13px] text-ink placeholder:text-stone focus:border-hairline-strong focus:bg-pure-white focus:outline-none"
          />
        </form>

        <div className="flex items-center gap-2">
          <label
            htmlFor="admin-audit-action-filter"
            className="text-[12px] text-stone"
          >
            Aktivitas:
          </label>
          <NativeSelect
            id="admin-audit-action-filter"
            data-testid="admin-audit-action-filter"
            value={actionFilter}
            disabled={isLoading}
            onChange={(event) => handleActionChange(event.target.value)}
          >
            {AUDIT_ACTION_FILTER_OPTIONS.map((option) => (
              <NativeSelectOption key={option.value} value={option.value}>
                {option.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>

      {error !== null && (
        <div
          data-testid="admin-audit-error"
          role="alert"
          className="flex items-center justify-between gap-3 rounded-lg border border-hairline bg-paper px-4 py-3 text-[13px] text-ink"
        >
          <span>{error}</span>
          <button
            data-testid="admin-audit-retry"
            type="button"
            onClick={handleRetry}
            className="rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-stone/5"
          >
            Coba lagi
          </button>
        </div>
      )}

      <div
        data-testid="admin-audit-table"
        aria-busy={isLoading}
        className="overflow-hidden rounded-lg border border-hairline bg-pure-white shadow-xs"
      >
        <Table>
          <TableHeader className="bg-paper">
            <TableRow>
              <TableHead className="w-36">Waktu</TableHead>
              <TableHead className="w-40">Administrator</TableHead>
              <TableHead>Aktivitas</TableHead>
              <TableHead>Target</TableHead>
              <TableHead className="w-24 text-right">Detail</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <div
                    data-testid={
                      error === null ? 'admin-audit-empty' : undefined
                    }
                    className="py-8 text-center text-[13px] text-stone"
                  >
                    {isLoading
                      ? 'Memuat aktivitas...'
                      : 'Tidak ada aktivitas yang ditemukan.'}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => {
                const presentation = presentLog(log)
                return (
                  <TableRow
                    key={log.id}
                    data-testid="admin-audit-row"
                    className="hover:bg-paper/40"
                  >
                    <TableCell className="whitespace-nowrap text-[12px] text-stone">
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar
                          user={{
                            name: presentation.actorLabel,
                            image: log.adminImage,
                          }}
                          className="h-6 w-6 text-[10px]"
                        />
                        <span className="block max-w-40 truncate text-[12px] font-medium text-ink">
                          {presentation.actorLabel}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-[13px] font-medium text-ink">
                        {presentation.actionLabel}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-64 truncate text-[12px] text-ink">
                        {presentation.targetLabel}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <button
                        data-testid="admin-audit-detail-button"
                        type="button"
                        disabled={isLoading}
                        onClick={() => {
                          setSelectedLog(log)
                          setCopied(false)
                        }}
                        className="inline-flex items-center gap-1 text-[12px] text-notion-blue hover:underline disabled:opacity-40"
                      >
                        <HugeiconsIcon
                          icon={EyeIcon}
                          size={14}
                          strokeWidth={1.75}
                        />
                        Lihat detail
                      </button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>

        <div className="flex flex-col gap-3 border-t border-hairline bg-paper px-4 py-3 text-[12px] text-stone sm:flex-row sm:items-center sm:justify-between">
          <span data-testid="admin-audit-page-info">
            Menampilkan {logs.length} dari {pagination.total} aktivitas ·
            Halaman {page} dari {Math.max(1, pagination.totalPages)}
          </span>
          <div className="flex items-center gap-2">
            <button
              data-testid="admin-audit-prev"
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => void fetchLogs(page - 1, search, actionFilter)}
              className="rounded border border-hairline bg-pure-white px-2.5 py-1 text-ink disabled:opacity-40 hover:bg-stone/5"
            >
              Sebelumnya
            </button>
            <button
              data-testid="admin-audit-next"
              type="button"
              disabled={page >= pagination.totalPages || isLoading}
              onClick={() => void fetchLogs(page + 1, search, actionFilter)}
              className="rounded border border-hairline bg-pure-white px-2.5 py-1 text-ink disabled:opacity-40 hover:bg-stone/5"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>

      <Dialog
        open={selectedLog !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLog(null)
            setCopied(false)
          }
        }}
      >
        <DialogContent data-testid="admin-audit-dialog" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Detail aktivitas
            </DialogTitle>
            <DialogDescription className="text-[12px] text-stone">
              {selectedPresentation?.actionLabel} ·{' '}
              {formatDate(selectedLog?.createdAt ?? null)}
            </DialogDescription>
          </DialogHeader>

          {selectedPresentation !== null && (
            <div className="space-y-4">
              <dl className="space-y-3 text-[13px]">
                <div>
                  <dt className="text-stone">Administrator</dt>
                  <dd
                    data-testid="admin-audit-detail-value"
                    className="font-medium text-ink"
                  >
                    {selectedPresentation.actorLabel}
                  </dd>
                </div>
                <div>
                  <dt className="text-stone">Target</dt>
                  <dd
                    data-testid="admin-audit-detail-value"
                    className="font-medium text-ink"
                  >
                    {selectedPresentation.targetLabel}
                  </dd>
                </div>
                {selectedPresentation.details.map((item) => (
                  <div key={item.label}>
                    <dt className="text-stone">{item.label}</dt>
                    <dd
                      data-testid="admin-audit-detail-value"
                      className="font-medium text-ink"
                    >
                      {item.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {selectedLog?.metadataUnreadable === true && (
                <p className="text-[12px] text-stone">
                  Metadata tidak dapat dibaca.
                </p>
              )}

              <Accordion defaultValue={[]}>
                <AccordionItem value="technical">
                  <AccordionTrigger
                    data-testid="admin-audit-technical-trigger"
                    className="text-[13px]"
                  >
                    Informasi teknis
                  </AccordionTrigger>
                  <AccordionPanel>
                    <pre
                      data-testid="admin-audit-technical-json"
                      className="max-h-64 overflow-auto rounded-md border border-hairline bg-paper p-3 font-mono text-[11px] text-ink"
                    >
                      {JSON.stringify(selectedPresentation.technical, null, 2)}
                    </pre>
                  </AccordionPanel>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          <DialogFooter className="gap-2">
            <button
              data-testid="admin-audit-copy"
              type="button"
              onClick={() => void handleCopy()}
              className="flex items-center gap-1.5 rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-stone/5"
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
              {copied ? 'Tersalin' : 'Salin informasi teknis'}
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
