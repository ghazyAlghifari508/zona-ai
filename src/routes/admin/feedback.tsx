import {
  Alert01Icon,
  Attachment01Icon,
  Bug01Icon,
  Idea01Icon,
  Loading03Icon,
  Message01Icon,
} from '@hugeicons/core-free-icons'
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
import { StatusText } from '../../components/ui/StatusText'
import { UserAvatar } from '../../components/ui/UserAvatar'
import {
  formatFeedbackCategory,
  formatFeedbackStatus,
} from '../../lib/admin/presentation'
import {
  listFeedbackFn,
  updateFeedbackStatusFn,
} from '../../server/functions/feedback'

export const Route = createFileRoute('/admin/feedback')({
  staleTime: 30_000,
  loader: async () => {
    const feedbackData = await listFeedbackFn({
      data: { page: 1, limit: 20 },
    })
    return { feedbackData }
  },
  component: AdminFeedbackPage,
})

export type FeedbackStatus = 'new' | 'in_progress' | 'resolved' | 'rejected'
export type FeedbackType = 'general' | 'feature' | 'bug'

export interface AdminFeedbackItem {
  id: string
  userId: string
  type: string
  title: string
  description: string
  stepsToReproduce?: string | null
  expectedBehavior?: string | null
  actualBehavior?: string | null
  attachmentR2Key?: string | null
  attachmentFileName?: string | null
  attachmentMimeType?: string | null
  attachmentFileSize?: number | null
  status: string
  adminNotes?: string | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
  userName?: string | null
  userEmail?: string | null
  userImage?: string | null
}

export interface AdminFeedbackViewProps {
  initialData: {
    feedback: AdminFeedbackItem[]
    total: number
    page: number
    limit: number
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
  }).format(d)
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function AdminFeedbackView({ initialData }: AdminFeedbackViewProps) {
  const [feedbackList, setFeedbackList] = useState<AdminFeedbackItem[]>(
    initialData.feedback,
  )
  const [total, setTotal] = useState(initialData.total)
  const [page, setPage] = useState(initialData.page)
  const limit = initialData.limit

  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>(
    'all',
  )
  const [typeFilter, setTypeFilter] = useState<FeedbackType | 'all'>('all')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Detail Modal State
  const [selectedItem, setSelectedItem] = useState<AdminFeedbackItem | null>(
    null,
  )
  const [updateStatus, setUpdateStatus] = useState<FeedbackStatus>('new')
  const [adminNotes, setAdminNotes] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

  const fetchFeedback = async (
    targetPage: number,
    targetStatus: FeedbackStatus | 'all',
    targetType: FeedbackType | 'all',
  ) => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const res = await listFeedbackFn({
        data: {
          page: targetPage,
          limit,
          status: targetStatus,
          type: targetType,
        },
      })
      setFeedbackList(res.feedback)
      setTotal(res.total)
      setPage(res.page)
    } catch {
      setErrorMessage('Gagal memuat daftar feedback.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusFilterChange = (newStatus: FeedbackStatus | 'all') => {
    setStatusFilter(newStatus)
    void fetchFeedback(1, newStatus, typeFilter)
  }

  const handleTypeFilterChange = (newType: FeedbackType | 'all') => {
    setTypeFilter(newType)
    void fetchFeedback(1, statusFilter, newType)
  }

  const handleOpenDetail = (item: AdminFeedbackItem) => {
    const isFeedbackStatus = (s: string): s is FeedbackStatus =>
      s === 'new' || s === 'in_progress' || s === 'resolved' || s === 'rejected'
    setSelectedItem(item)
    setUpdateStatus(isFeedbackStatus(item.status) ? item.status : 'new')
    setAdminNotes(item.adminNotes || '')
  }

  const handleSaveStatus = async () => {
    if (!selectedItem) return
    setIsUpdating(true)
    setErrorMessage(null)
    try {
      await updateFeedbackStatusFn({
        data: {
          feedbackId: selectedItem.id,
          status: updateStatus,
          adminNotes: adminNotes.trim() ? adminNotes.trim() : null,
        },
      })
      // Update local item
      const updated = {
        ...selectedItem,
        status: updateStatus,
        adminNotes: adminNotes.trim() ? adminNotes.trim() : null,
      }
      setSelectedItem(updated)
      setFeedbackList((prev) =>
        prev.map((fb) => (fb.id === selectedItem.id ? updated : fb)),
      )
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Gagal memperbarui status feedback.',
      )
    } finally {
      setIsUpdating(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const renderStatusText = (status: string) => (
    <StatusText>{formatFeedbackStatus(status)}</StatusText>
  )

  const renderCategoryText = (type: string) => {
    const icon =
      type === 'bug'
        ? Bug01Icon
        : type === 'feature'
          ? Idea01Icon
          : Message01Icon
    return (
      <StatusText className="inline-flex items-center gap-1">
        <HugeiconsIcon
          icon={icon}
          size={12}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {formatFeedbackCategory(type)}
      </StatusText>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          Kotak Masuk Feedback
        </h1>
        <p className="mt-1 text-[13px] text-stone">
          Tinjau laporan kendala teknis, aspirasi fitur, dan masukan umum dari
          pengguna.
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-coral/20 bg-danger-soft p-3 text-[13px] text-coral">
          <HugeiconsIcon icon={Alert01Icon} size={16} strokeWidth={1.75} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-hairline bg-pure-white p-4 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-stone">Status:</span>
            <select
              data-testid="admin-feedback-status-filter"
              value={statusFilter}
              onChange={(e) =>
                handleStatusFilterChange(
                  e.target.value as FeedbackStatus | 'all',
                )
              }
              className="h-9 rounded-md border border-hairline bg-paper px-3 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
            >
              <option value="all">Semua Status</option>
              <option value="new">Baru</option>
              <option value="in_progress">Diproses</option>
              <option value="resolved">Selesai</option>
              <option value="rejected">Ditolak</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-stone">Kategori:</span>
            <select
              data-testid="admin-feedback-type-filter"
              value={typeFilter}
              onChange={(e) =>
                handleTypeFilterChange(e.target.value as FeedbackType | 'all')
              }
              className="h-9 rounded-md border border-hairline bg-paper px-3 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
            >
              <option value="all">Semua Kategori</option>
              <option value="general">Umum</option>
              <option value="feature">Saran fitur</option>
              <option value="bug">Laporan bug</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div
        data-testid="admin-feedback-table"
        className="overflow-hidden rounded-lg border border-hairline bg-pure-white shadow-xs"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-hairline bg-paper text-[11px] font-semibold tracking-wider text-stone uppercase">
              <tr>
                <th className="px-4 py-3">Pengirim</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Judul & Masalah</th>
                <th className="px-4 py-3">Lampiran</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {feedbackList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-stone">
                    {isLoading
                      ? 'Memuat data feedback...'
                      : 'Tidak ada feedback yang cocok dengan filter.'}
                  </td>
                </tr>
              ) : (
                feedbackList.map((item) => (
                  <tr
                    key={item.id}
                    className="transition-colors hover:bg-paper/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <UserAvatar
                          user={{
                            name: item.userName || item.userEmail || 'Pengguna',
                            image: item.userImage,
                          }}
                          className="h-7 w-7 text-[10px]"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-ink truncate">
                            {item.userName || 'Tanpa Nama'}
                          </p>
                          <p className="text-[11px] text-stone truncate">
                            {item.userEmail}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {renderCategoryText(item.type)}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      <p className="font-medium text-ink truncate">
                        {item.title}
                      </p>
                      <p className="text-[12px] text-stone truncate">
                        {item.description}
                      </p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {item.attachmentR2Key ? (
                        <span className="flex items-center gap-1 text-[12px] text-notion-blue">
                          <HugeiconsIcon
                            icon={Attachment01Icon}
                            size={14}
                            strokeWidth={1.75}
                          />
                          <span>
                            Ada ({formatFileSize(item.attachmentFileSize)})
                          </span>
                        </span>
                      ) : (
                        <span className="text-[12px] text-stone">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {renderStatusText(item.status)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-stone">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        data-testid={`view-feedback-btn-${item.id}`}
                        onClick={() => handleOpenDetail(item)}
                        className="rounded-md border border-hairline bg-pure-white px-3 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-stone/10"
                      >
                        Tinjau
                      </button>
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
            Menampilkan {feedbackList.length} dari {total} feedback
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => fetchFeedback(page - 1, statusFilter, typeFilter)}
              className="rounded border border-hairline bg-pure-white px-2.5 py-1 text-ink disabled:opacity-40 hover:bg-stone/5"
            >
              Sebelumnya
            </button>
            <span>
              Halaman {page} dari {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || isLoading}
              onClick={() => fetchFeedback(page + 1, statusFilter, typeFilter)}
              className="rounded border border-hairline bg-pure-white px-2.5 py-1 text-ink disabled:opacity-40 hover:bg-stone/5"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>

      {/* Detail Modal */}
      <Dialog
        open={selectedItem !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedItem(null)
        }}
      >
        <DialogContent
          data-testid="feedback-detail-modal"
          className="max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <DialogHeader>
            <div className="flex items-center gap-2">
              {selectedItem && renderCategoryText(selectedItem.type)}
              <DialogTitle className="text-[18px] font-bold text-ink">
                {selectedItem?.title}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[12px] text-stone">
              Dilaporkan oleh{' '}
              {selectedItem?.userName || selectedItem?.userEmail} pada{' '}
              {formatDate(selectedItem?.createdAt ?? null)}
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 py-2 text-[13px]">
              <div>
                <h4 className="text-[12px] font-semibold text-stone uppercase tracking-wider">
                  Deskripsi Lengkap
                </h4>
                <p className="mt-1 whitespace-pre-wrap rounded-md border border-hairline bg-paper p-3 text-ink leading-relaxed">
                  {selectedItem.description}
                </p>
              </div>

              {selectedItem.stepsToReproduce && (
                <div>
                  <h4 className="text-[12px] font-semibold text-stone uppercase tracking-wider">
                    Langkah untuk Mereproduksi
                  </h4>
                  <p className="mt-1 whitespace-pre-wrap rounded-md border border-hairline bg-paper p-3 text-ink leading-relaxed">
                    {selectedItem.stepsToReproduce}
                  </p>
                </div>
              )}

              {(selectedItem.expectedBehavior ||
                selectedItem.actualBehavior) && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {selectedItem.expectedBehavior && (
                    <div>
                      <h4 className="text-[12px] font-semibold text-stone uppercase tracking-wider">
                        Hasil yang Diharapkan
                      </h4>
                      <p className="mt-1 whitespace-pre-wrap rounded-md border border-hairline bg-paper p-2.5 text-ink leading-relaxed">
                        {selectedItem.expectedBehavior}
                      </p>
                    </div>
                  )}
                  {selectedItem.actualBehavior && (
                    <div>
                      <h4 className="text-[12px] font-semibold text-stone uppercase tracking-wider">
                        Hasil yang Sebenarnya
                      </h4>
                      <p className="mt-1 whitespace-pre-wrap rounded-md border border-hairline bg-paper p-2.5 text-ink leading-relaxed">
                        {selectedItem.actualBehavior}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Attachment link */}
              {selectedItem.attachmentR2Key && (
                <div>
                  <h4 className="text-[12px] font-semibold text-stone uppercase tracking-wider">
                    Berkas Lampiran
                  </h4>
                  <a
                    href={`/api/feedback/attachment?id=${selectedItem.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="feedback-attachment-link"
                    className="mt-1.5 inline-flex items-center gap-2 rounded-md border border-hairline bg-pure-white px-3 py-2 text-[13px] font-medium text-notion-blue transition-colors hover:bg-sky-tint"
                  >
                    <HugeiconsIcon
                      icon={Attachment01Icon}
                      size={16}
                      strokeWidth={1.75}
                    />
                    <span>
                      {selectedItem.attachmentFileName || 'Buka Lampiran'}
                    </span>
                    {selectedItem.attachmentFileSize && (
                      <span className="text-[11px] text-stone">
                        ({formatFileSize(selectedItem.attachmentFileSize)})
                      </span>
                    )}
                  </a>
                </div>
              )}

              {/* Status Update & Admin Notes */}
              <div className="border-t border-hairline pt-4">
                <h4 className="text-[13px] font-semibold text-ink">
                  Tindakan & Catatan Administrator
                </h4>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="update-status-select"
                      className="block text-[12px] font-medium text-stone"
                    >
                      Status Feedback
                    </label>
                    <select
                      id="update-status-select"
                      value={updateStatus}
                      onChange={(e) =>
                        setUpdateStatus(e.target.value as FeedbackStatus)
                      }
                      className="mt-1 h-9 w-full rounded-md border border-hairline bg-paper px-3 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
                    >
                      <option value="new">Baru</option>
                      <option value="in_progress">Diproses</option>
                      <option value="resolved">Selesai</option>
                      <option value="rejected">Ditolak</option>
                    </select>
                  </div>
                </div>

                <div className="mt-3">
                  <label
                    htmlFor="admin-notes-textarea"
                    className="block text-[12px] font-medium text-stone"
                  >
                    Catatan Internal Admin (Opsional)
                  </label>
                  <textarea
                    id="admin-notes-textarea"
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="Tulis catatan atau tindakan yang sudah dilakukan..."
                    rows={3}
                    className="mt-1 w-full rounded-md border border-hairline bg-paper p-2.5 text-[13px] text-ink placeholder:text-stone focus:border-hairline-strong focus:bg-pure-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-stone hover:bg-stone/5"
              >
                Tutup
              </button>
            </DialogClose>
            <button
              type="button"
              disabled={isUpdating}
              onClick={handleSaveStatus}
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isUpdating && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              <span>Simpan Perubahan</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdminFeedbackPage() {
  const loaderData = Route.useLoaderData()
  return <AdminFeedbackView initialData={loaderData.feedbackData} />
}
