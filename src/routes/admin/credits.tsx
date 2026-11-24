import {
  Alert01Icon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  Loading03Icon,
  Search01Icon,
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
import {
  NativeSelect,
  NativeSelectOption,
} from '../../components/ui/native-select'
import { StatusText } from '../../components/ui/StatusText'
import { UserAvatar } from '../../components/ui/UserAvatar'
import { formatUserRole } from '../../lib/admin/presentation'
import {
  adjustUserCreditsFn,
  listUserCreditsFn,
  resetDevCreditsFn,
} from '../../server/functions/credits'

export const Route = createFileRoute('/admin/credits')({
  staleTime: 30_000,
  loader: async () => {
    const creditsData = await listUserCreditsFn({
      data: { page: 1, limit: 20 },
    })
    return { creditsData }
  },
  component: AdminCreditsPage,
})

export interface AdminCreditUserItem {
  id: string
  name: string | null
  email: string
  image: string | null
  credits: number | null
  role: string
  banned?: boolean | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
}

export interface AdminCreditsViewProps {
  initialData: {
    users: AdminCreditUserItem[]
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

function formatNumber(num: number): string {
  return new Intl.NumberFormat('id-ID').format(num)
}

export function AdminCreditsView({ initialData }: AdminCreditsViewProps) {
  const [users, setUsers] = useState<AdminCreditUserItem[]>(initialData.users)
  const [total, setTotal] = useState(initialData.total)
  const [page, setPage] = useState(initialData.page)
  const limit = initialData.limit

  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  // Adjust modal state
  const [adjustTargetUser, setAdjustTargetUser] =
    useState<AdminCreditUserItem | null>(null)
  const [adjustMode, setAdjustMode] = useState<'add' | 'deduct' | 'set'>('add')
  const [adjustAmount, setAdjustAmount] = useState<number>(100)
  const [adjustReason, setAdjustReason] = useState('')
  const [isSubmittingAdjust, setIsSubmittingAdjust] = useState(false)

  const fetchUsers = async (targetPage: number, targetSearch: string) => {
    setIsLoading(true)
    setStatusMessage(null)
    try {
      const res = await listUserCreditsFn({
        data: {
          page: targetPage,
          limit,
          search: targetSearch.trim() ? targetSearch.trim() : null,
        },
      })
      setUsers(res.users)
      setTotal(res.total)
      setPage(res.page)
    } catch {
      setStatusMessage({
        type: 'error',
        text: 'Gagal memuat data saldo kredit pengguna.',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void fetchUsers(1, search)
  }

  const handleAdjustConfirm = async () => {
    if (!adjustTargetUser) return
    setIsSubmittingAdjust(true)
    setStatusMessage(null)
    try {
      const res = await adjustUserCreditsFn({
        data: {
          userId: adjustTargetUser.id,
          mode: adjustMode,
          amount: Math.max(0, Math.floor(adjustAmount)),
          reason: adjustReason.trim() ? adjustReason.trim() : null,
        },
      })
      // Update local state
      setUsers((prev) =>
        prev.map((u) =>
          u.id === adjustTargetUser.id ? { ...u, credits: res.newBalance } : u,
        ),
      )
      setStatusMessage({
        type: 'success',
        text: `Saldo untuk ${adjustTargetUser.name || adjustTargetUser.email} berhasil disesuaikan menjadi ${formatNumber(res.newBalance)} kredit.`,
      })
      setAdjustTargetUser(null)
      setAdjustReason('')
      setAdjustAmount(100)
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal menyesuaikan saldo kredit.',
      })
    } finally {
      setIsSubmittingAdjust(false)
    }
  }

  const handleResetDevCredits = async (user: AdminCreditUserItem) => {
    setIsLoading(true)
    setStatusMessage(null)
    try {
      const res = await resetDevCreditsFn({
        data: { targetUserId: user.id },
      })
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id ? { ...u, credits: res.newBalance } : u,
        ),
      )
      setStatusMessage({
        type: 'success',
        text: `Saldo dev untuk ${user.name || user.email} direset ke ${res.newBalance} kredit.`,
      })
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Reset dev credits gagal (hanya tersedia di lingkungan pengembangan).',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const currentBalance = adjustTargetUser?.credits ?? 0
  let projectedBalance = currentBalance
  if (adjustMode === 'add') {
    projectedBalance = currentBalance + (adjustAmount || 0)
  } else if (adjustMode === 'deduct') {
    projectedBalance = Math.max(0, currentBalance - (adjustAmount || 0))
  } else if (adjustMode === 'set') {
    projectedBalance = Math.max(0, adjustAmount || 0)
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          Manajemen Kredit Pengguna
        </h1>
        <p className="mt-1 text-[13px] text-stone">
          Lihat saldo kredit akun terdaftar dan lakukan penyesuaian saldo secara
          manual dengan audit terinci.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-[13px] ${
            statusMessage.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-coral/30 bg-danger-soft text-coral'
          }`}
        >
          <HugeiconsIcon
            icon={
              statusMessage.type === 'success'
                ? CheckmarkCircle02Icon
                : Alert01Icon
            }
            size={16}
            strokeWidth={1.75}
          />
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Search Header */}
      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-pure-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            strokeWidth={1.75}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-stone"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari berdasarkan nama atau email pengguna..."
            className="h-9 w-full rounded-md border border-hairline bg-paper pr-3 pl-9 text-[13px] text-ink placeholder:text-stone focus:border-hairline-strong focus:bg-pure-white focus:outline-none"
          />
        </form>
      </div>

      {/* Credit Balances Table */}
      <div
        data-testid="admin-credits-table"
        className="overflow-hidden rounded-lg border border-hairline bg-pure-white shadow-xs"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-hairline bg-paper text-[11px] font-semibold tracking-wider text-stone uppercase">
              <tr>
                <th className="px-4 py-3">Pengguna</th>
                <th className="px-4 py-3">Peran</th>
                <th className="px-4 py-3">Saldo Kredit</th>
                <th className="px-4 py-3">Terakhir Diperbarui</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-stone">
                    {isLoading
                      ? 'Memuat data saldo...'
                      : 'Tidak ada pengguna yang ditemukan.'}
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr
                    key={user.id}
                    className="transition-colors hover:bg-paper/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          user={{
                            name: user.name || user.email,
                            image: user.image,
                          }}
                          className="h-8 w-8 text-[11px]"
                        />
                        <div className="min-w-0">
                          <p className="font-medium text-ink truncate">
                            {user.name || 'Tanpa Nama'}
                          </p>
                          <p className="text-[12px] text-stone truncate">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusText>{formatUserRole(user.role)}</StatusText>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-[14px] text-ink">
                      <div className="flex items-center gap-1.5">
                        <HugeiconsIcon
                          icon={Coins01Icon}
                          size={16}
                          strokeWidth={1.75}
                          className="text-marigold"
                        />
                        <span>{formatNumber(user.credits ?? 0)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-stone">
                      {formatDate(user.updatedAt || user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid={`adjust-credits-btn-${user.id}`}
                          onClick={() => {
                            setAdjustTargetUser(user)
                            setAdjustMode('add')
                            setAdjustAmount(100)
                            setAdjustReason('')
                          }}
                          className="rounded-md border border-hairline bg-pure-white px-3 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-stone/10"
                        >
                          Sesuaikan
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetDevCredits(user)}
                          title="Reset saldo ke kuota dev (100 kredit)"
                          className="rounded-md border border-hairline bg-paper px-2 py-1 text-[11px] text-stone transition-colors hover:text-ink"
                        >
                          Dev Reset
                        </button>
                      </div>
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
            Menampilkan {users.length} dari {total} pengguna
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() => fetchUsers(page - 1, search)}
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
              onClick={() => fetchUsers(page + 1, search)}
              className="rounded border border-hairline bg-pure-white px-2.5 py-1 text-ink disabled:opacity-40 hover:bg-stone/5"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>

      {/* Adjust Credits Dialog */}
      <Dialog
        open={adjustTargetUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAdjustTargetUser(null)
            setAdjustReason('')
            setAdjustAmount(100)
          }
        }}
      >
        <DialogContent data-testid="adjust-credits-dialog" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Sesuaikan Saldo Kredit
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone">
              Tindakan ini akan memodifikasi saldo akun secara instan dan
              dicatat ke log audit sistem.
            </DialogDescription>
          </DialogHeader>

          {adjustTargetUser && (
            <div className="space-y-4 py-2 text-[13px]">
              <div className="rounded-md border border-hairline bg-paper p-3">
                <p className="font-semibold text-ink">
                  {adjustTargetUser.name || 'Tanpa Nama'}
                </p>
                <p className="text-[12px] text-stone">
                  {adjustTargetUser.email}
                </p>
                <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2 text-[12px]">
                  <span className="text-stone">Saldo Saat Ini:</span>
                  <span className="font-semibold text-ink">
                    {formatNumber(currentBalance)} kredit
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="adjust-credits-mode-select"
                  className="block text-[12px] font-medium text-ink"
                >
                  Mode Penyesuaian
                </label>
                <NativeSelect
                  id="adjust-credits-mode-select"
                  data-testid="adjust-credits-mode-select"
                  className="mt-1 w-full bg-pure-white"
                  value={adjustMode}
                  onChange={(e) =>
                    setAdjustMode(e.target.value as 'add' | 'deduct' | 'set')
                  }
                >
                  <NativeSelectOption value="add">
                    Tambah Saldo (+)
                  </NativeSelectOption>
                  <NativeSelectOption value="deduct">
                    Kurangi Saldo (-)
                  </NativeSelectOption>
                  <NativeSelectOption value="set">
                    Tetapkan Saldo Baru (=)
                  </NativeSelectOption>
                </NativeSelect>
              </div>

              <div>
                <label
                  htmlFor="adjust-credits-amount-input"
                  className="block text-[12px] font-medium text-ink"
                >
                  Jumlah Kredit
                </label>
                <input
                  id="adjust-credits-amount-input"
                  type="number"
                  min="0"
                  data-testid="adjust-credits-amount-input"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(Number(e.target.value))}
                  className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
                />
              </div>

              <div className="rounded-md border border-hairline bg-sky-tint/50 p-3">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="text-stone">Estimasi Saldo Akhir:</span>
                  <span className="text-[14px] font-bold text-notion-blue">
                    {formatNumber(projectedBalance)} kredit
                  </span>
                </div>
              </div>

              <div>
                <label
                  htmlFor="adjust-credits-reason-input"
                  className="block text-[12px] font-medium text-ink"
                >
                  Alasan Penyesuaian (Opsional)
                </label>
                <textarea
                  id="adjust-credits-reason-input"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="Misal: Kompensasi atas gangguan layanan, bonus promo..."
                  rows={2}
                  className="mt-1 w-full rounded-md border border-hairline bg-pure-white p-2.5 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-stone hover:bg-stone/5"
              >
                Batal
              </button>
            </DialogClose>
            <button
              type="button"
              disabled={isSubmittingAdjust}
              onClick={handleAdjustConfirm}
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmittingAdjust && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              <span>Terapkan Saldo</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdminCreditsPage() {
  const loaderData = Route.useLoaderData()
  return <AdminCreditsView initialData={loaderData.creditsData} />
}
