import {
  Alert01Icon,
  Delete02Icon,
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
import { UserAvatar } from '../../components/ui/UserAvatar'
import { verifyAdminAccessFn } from '../../server/functions/admin-auth'
import {
  banUserFn,
  deleteUserFn,
  listUsersFn,
  unbanUserFn,
} from '../../server/functions/admin-users'
import { getCachedAdminUser } from '../admin'

export const Route = createFileRoute('/admin/users')({
  staleTime: 30_000,
  loader: async () => {
    let currentAdmin = getCachedAdminUser()
    const [authResult, usersData] = await Promise.all([
      currentAdmin
        ? Promise.resolve({ user: currentAdmin })
        : verifyAdminAccessFn(),
      listUsersFn({ data: { page: 1, limit: 20 } }),
    ])
    if (!currentAdmin) {
      currentAdmin = authResult.user
    }
    return {
      currentAdmin,
      usersData,
    }
  },
  component: AdminUsersPage,
})

export interface AdminUserItem {
  id: string
  name: string | null
  email: string
  emailVerified?: boolean | null
  image: string | null
  credits: number | null
  role: string
  banned: boolean | null
  banReason?: string | null
  banExpires?: Date | string | null
  createdAt: Date | string | null
  updatedAt: Date | string | null
}

export interface AdminUsersViewProps {
  initialData: {
    users: AdminUserItem[]
    total: number
    page: number
    limit: number
  }
  currentAdminId?: string
  currentAdminEmail?: string
}

function formatDate(date: Date | string | null): string {
  if (!date) return '-'
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

export function AdminUsersView({
  initialData,
  currentAdminId,
  currentAdminEmail,
}: AdminUsersViewProps) {
  const [users, setUsers] = useState<AdminUserItem[]>(initialData.users)
  const [total, setTotal] = useState(initialData.total)
  const [page, setPage] = useState(initialData.page)
  const limit = initialData.limit

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'banned'>(
    'all',
  )
  const [isLoading, setIsLoading] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  // Ban Dialog state
  const [banTargetUser, setBanTargetUser] = useState<AdminUserItem | null>(null)
  const [banReason, setBanReason] = useState('')
  const [banExpires, setBanExpires] = useState('')
  const [isSubmittingBan, setIsSubmittingBan] = useState(false)

  // Unban confirmation state
  const [unbanTargetUser, setUnbanTargetUser] = useState<AdminUserItem | null>(
    null,
  )
  const [isSubmittingUnban, setIsSubmittingUnban] = useState(false)

  // Delete confirmation state
  const [deleteTargetUser, setDeleteTargetUser] =
    useState<AdminUserItem | null>(null)
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false)

  const fetchUsers = async (
    targetPage: number,
    targetSearch: string,
    targetRole: 'all' | 'admin' | 'user',
    targetStatus: 'all' | 'active' | 'banned',
  ) => {
    setIsLoading(true)
    setActionError(null)
    try {
      const res = await listUsersFn({
        data: {
          page: targetPage,
          limit,
          search: targetSearch.trim() ? targetSearch.trim() : null,
          role: targetRole,
          status: targetStatus,
        },
      })
      setUsers(res.users)
      setTotal(res.total)
      setPage(res.page)
    } catch {
      setActionError('Gagal memuat daftar pengguna.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    void fetchUsers(1, search, roleFilter, statusFilter)
  }

  const handleRoleChange = (newRole: 'all' | 'admin' | 'user') => {
    setRoleFilter(newRole)
    void fetchUsers(1, search, newRole, statusFilter)
  }

  const handleStatusChange = (newStatus: 'all' | 'active' | 'banned') => {
    setStatusFilter(newStatus)
    void fetchUsers(1, search, roleFilter, newStatus)
  }

  const handleBanConfirm = async () => {
    if (!banTargetUser) return
    setIsSubmittingBan(true)
    setActionError(null)
    try {
      await banUserFn({
        data: {
          userId: banTargetUser.id,
          reason: banReason.trim() ? banReason.trim() : null,
          expiresAt: banExpires.trim()
            ? new Date(banExpires).toISOString()
            : null,
        },
      })
      setBanTargetUser(null)
      setBanReason('')
      setBanExpires('')
      await fetchUsers(page, search, roleFilter, statusFilter)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal memblokir pengguna.',
      )
    } finally {
      setIsSubmittingBan(false)
    }
  }

  const handleUnbanConfirm = async () => {
    if (!unbanTargetUser) return
    setIsSubmittingUnban(true)
    setActionError(null)
    try {
      await unbanUserFn({
        data: {
          userId: unbanTargetUser.id,
        },
      })
      setUnbanTargetUser(null)
      await fetchUsers(page, search, roleFilter, statusFilter)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal membuka blokir pengguna.',
      )
    } finally {
      setIsSubmittingUnban(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!deleteTargetUser) return
    setIsSubmittingDelete(true)
    setActionError(null)
    try {
      await deleteUserFn({
        data: {
          userId: deleteTargetUser.id,
        },
      })
      setDeleteTargetUser(null)
      await fetchUsers(page, search, roleFilter, statusFilter)
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Gagal menghapus pengguna.',
      )
    } finally {
      setIsSubmittingDelete(false)
    }
  }

  const isProtectedAdmin = (user: AdminUserItem) => {
    const normalizedEmail = user.email.trim().toLowerCase()
    return (
      (currentAdminId !== undefined && user.id === currentAdminId) ||
      (currentAdminEmail !== undefined &&
        normalizedEmail === currentAdminEmail.trim().toLowerCase()) ||
      normalizedEmail === 'alghifarighazy508@gmail.com'
    )
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          Manajemen Pengguna
        </h1>
        <p className="mt-1 text-[13px] text-stone">
          Kelola hak akses pengguna, periksa riwayat akun, dan terapkan
          pemblokiran jika diperlukan.
        </p>
      </div>

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg border border-coral/20 bg-danger-soft p-3 text-[13px] text-coral">
          <HugeiconsIcon icon={Alert01Icon} size={16} strokeWidth={1.75} />
          <span>{actionError}</span>
        </div>
      )}

      {/* Filter and Search Controls */}
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
            data-testid="admin-users-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama atau email pengguna..."
            className="h-9 w-full rounded-md border border-hairline bg-paper pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-stone focus:border-hairline-strong focus:bg-pure-white focus:outline-none focus:ring-1 focus:ring-ink/20"
          />
        </form>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-stone">Peran:</span>
            <select
              data-testid="admin-users-role-filter"
              value={roleFilter}
              onChange={(e) =>
                handleRoleChange(e.target.value as 'all' | 'admin' | 'user')
              }
              className="h-9 rounded-md border border-hairline bg-paper px-2.5 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
            >
              <option value="all">Semua Peran</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-stone">Status:</span>
            <select
              data-testid="admin-users-status-filter"
              value={statusFilter}
              onChange={(e) =>
                handleStatusChange(
                  e.target.value as 'all' | 'active' | 'banned',
                )
              }
              className="h-9 rounded-md border border-hairline bg-paper px-2.5 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
            >
              <option value="all">Semua Status</option>
              <option value="active">Aktif</option>
              <option value="banned">Diblokir</option>
            </select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-hidden rounded-lg border border-hairline bg-pure-white shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-hairline bg-paper text-[11px] font-semibold tracking-wider text-stone uppercase">
              <tr>
                <th className="px-4 py-3">Pengguna</th>
                <th className="px-4 py-3">Peran</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Saldo Kredit</th>
                <th className="px-4 py-3">Bergabung</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone">
                    {isLoading
                      ? 'Memuat data pengguna...'
                      : 'Tidak ada pengguna yang cocok dengan kriteria.'}
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isSelfOrPrimary = isProtectedAdmin(user)
                  return (
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
                        <span
                          className={`rounded px-2 py-0.5 text-[11px] font-medium uppercase ${
                            user.role === 'admin'
                              ? 'bg-sky-tint text-notion-blue border border-notion-blue/20'
                              : 'bg-paper text-stone border border-hairline'
                          }`}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {user.banned ? (
                          <span className="rounded bg-danger-soft border border-coral/20 px-2 py-0.5 text-[11px] font-medium text-coral">
                            Diblokir
                          </span>
                        ) : (
                          <span className="rounded bg-success/10 border border-success/20 px-2 py-0.5 text-[11px] font-medium text-success">
                            Aktif
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-ink">
                        {user.credits ?? 0}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-stone text-[12px]">
                        {formatDate(user.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {user.banned ? (
                            <button
                              type="button"
                              data-testid={`unban-user-btn-${user.id}`}
                              onClick={() => setUnbanTargetUser(user)}
                              className="rounded-md border border-hairline bg-pure-white px-2.5 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-stone/10"
                            >
                              Buka Blokir
                            </button>
                          ) : (
                            <button
                              type="button"
                              data-testid={`ban-user-btn-${user.id}`}
                              disabled={isSelfOrPrimary}
                              onClick={() => {
                                if (!isSelfOrPrimary) {
                                  setBanTargetUser(user)
                                }
                              }}
                              title={
                                isSelfOrPrimary
                                  ? 'Tidak dapat memblokir akun sendiri atau admin utama'
                                  : 'Blokir akun pengguna ini'
                              }
                              className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                                isSelfOrPrimary
                                  ? 'cursor-not-allowed border border-hairline bg-paper text-stone/50'
                                  : 'border border-coral/30 bg-danger-soft text-coral hover:bg-coral/15'
                              }`}
                            >
                              Blokir
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid={`delete-user-btn-${user.id}`}
                            disabled={isSelfOrPrimary}
                            onClick={() => {
                              if (!isSelfOrPrimary) {
                                setDeleteTargetUser(user)
                              }
                            }}
                            title={
                              isSelfOrPrimary
                                ? 'Tidak dapat menghapus akun sendiri atau admin utama'
                                : 'Hapus akun pengguna ini'
                            }
                            className={`rounded-md p-1 transition-colors ${
                              isSelfOrPrimary
                                ? 'cursor-not-allowed text-stone/30'
                                : 'text-stone hover:bg-danger-soft hover:text-coral'
                            }`}
                            aria-label={`Hapus ${user.name ?? user.email}`}
                          >
                            <HugeiconsIcon
                              icon={Delete02Icon}
                              size={15}
                              strokeWidth={1.75}
                            />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className="flex items-center justify-between border-t border-hairline bg-paper px-4 py-3 text-[12px] text-stone">
          <span>
            Menampilkan {users.length} dari {total} pengguna
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || isLoading}
              onClick={() =>
                fetchUsers(page - 1, search, roleFilter, statusFilter)
              }
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
              onClick={() =>
                fetchUsers(page + 1, search, roleFilter, statusFilter)
              }
              className="rounded border border-hairline bg-pure-white px-2.5 py-1 text-ink disabled:opacity-40 hover:bg-stone/5"
            >
              Berikutnya
            </button>
          </div>
        </div>
      </div>

      {/* Ban Dialog */}
      <Dialog
        open={banTargetUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            setBanTargetUser(null)
            setBanReason('')
            setBanExpires('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Blokir Akun Pengguna
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone">
              Tindakan ini akan mencabut akses akun untuk masuk dan menggunakan
              layanan Zona.ai.
            </DialogDescription>
          </DialogHeader>

          {banTargetUser && (
            <div className="space-y-4 py-2 text-[13px]">
              <div className="rounded-md border border-hairline bg-paper p-3">
                <p className="font-semibold text-ink">
                  {banTargetUser.name || 'Tanpa Nama'}
                </p>
                <p className="text-[12px] text-stone">{banTargetUser.email}</p>
              </div>

              <div>
                <label
                  htmlFor="ban-reason-input"
                  className="block text-[12px] font-medium text-ink"
                >
                  Alasan Pemblokiran
                </label>
                <textarea
                  id="ban-reason-input"
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Misal: Pelanggaran ketentuan penggunaan..."
                  rows={3}
                  className="mt-1 w-full rounded-md border border-hairline bg-pure-white p-2.5 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="ban-expires-input"
                  className="block text-[12px] font-medium text-ink"
                >
                  Batas Waktu (Opsional)
                </label>
                <input
                  id="ban-expires-input"
                  type="datetime-local"
                  value={banExpires}
                  onChange={(e) => setBanExpires(e.target.value)}
                  className="mt-1 w-full rounded-md border border-hairline bg-pure-white p-2 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
                />
                <span className="mt-1 block text-[11px] text-stone">
                  Kosongkan jika pemblokiran bersifat permanen.
                </span>
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
              disabled={isSubmittingBan}
              onClick={handleBanConfirm}
              className="flex items-center gap-1.5 rounded-md bg-coral px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmittingBan && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              <span>Konfirmasi Blokir</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unban Dialog */}
      <Dialog
        open={unbanTargetUser !== null}
        onOpenChange={(open) => {
          if (!open) setUnbanTargetUser(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Buka Blokir Pengguna
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone">
              Apakah Anda yakin ingin memulihkan akses akun ini?
            </DialogDescription>
          </DialogHeader>

          {unbanTargetUser && (
            <div className="rounded-md border border-hairline bg-paper p-3 text-[13px]">
              <p className="font-semibold text-ink">
                {unbanTargetUser.name || 'Tanpa Nama'}
              </p>
              <p className="text-[12px] text-stone">{unbanTargetUser.email}</p>
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
              disabled={isSubmittingUnban}
              onClick={handleUnbanConfirm}
              className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmittingUnban && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              <span>Buka Blokir</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog
        open={deleteTargetUser !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTargetUser(null)
        }}
      >
        <DialogContent
          data-testid="admin-delete-user-modal"
          className="max-w-md bg-pure-white"
        >
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-coral">
              Hapus Pengguna Permanen
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone">
              Apakah Anda yakin ingin menghapus akun ini secara permanen?
            </DialogDescription>
          </DialogHeader>

          {deleteTargetUser && (
            <div className="rounded-md border border-coral/20 bg-danger-soft p-3 text-[13px]">
              <p className="font-semibold text-ink">
                {deleteTargetUser.name || 'Tanpa Nama'}
              </p>
              <p className="text-[12px] text-stone">{deleteTargetUser.email}</p>
              <p className="mt-2 text-[11px] text-coral">
                Peringatan: Seluruh riwayat percakapan, sesi, dan data akun akan
                dihapus permanen dari basis data. Tindakan ini tidak dapat
                dibatalkan.
              </p>
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
              data-testid="confirm-delete-user-btn"
              disabled={isSubmittingDelete}
              onClick={handleDeleteConfirm}
              className="flex items-center gap-1.5 rounded-md bg-coral px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmittingDelete && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              <span>Hapus Pengguna</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdminUsersPage() {
  const loaderData = Route.useLoaderData()
  return (
    <AdminUsersView
      initialData={loaderData.usersData}
      currentAdminId={loaderData.currentAdmin.id}
      currentAdminEmail={loaderData.currentAdmin.email}
    />
  )
}
