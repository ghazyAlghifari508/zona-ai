import {
  CheckmarkCircle02Icon,
  Delete02Icon,
  Logout01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useModelCatalog } from '@/components/chat/useModelCatalog'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { authClient } from '@/lib/auth/auth-client'
import { useDefaultSkill } from '@/lib/chat/skill-preference'
import { getSkillDefinition, SKILL_IDS } from '@/lib/chat/skills'
import { useDefaultModel } from '@/lib/models/preference'
import { deleteAllConversations } from '@/server/functions/conversations'
import { getCreditBalanceFn } from '@/server/functions/credits'
import { getCurrentSession } from '@/server/functions/session'

export const Route = createFileRoute('/settings')({
  staleTime: 60_000,
  beforeLoad: async () => {
    try {
      const session = await getCurrentSession()
      return { session }
    } catch {
      throw redirect({ to: '/auth/sign-in' })
    }
  },
  loader: async ({
    context,
  }: {
    context?: { session?: Awaited<ReturnType<typeof getCurrentSession>> }
  }) => {
    const [session, credit] = await Promise.all([
      context?.session ? Promise.resolve(context.session) : getCurrentSession(),
      getCreditBalanceFn(),
    ])
    return {
      session,
      creditBalance: credit.balance,
    }
  },
  component: SettingsPage,
})

function SettingsPage() {
  const loaderData = Route.useLoaderData()
  const queryClient = useQueryClient()

  const { data: clientSession } = authClient.useSession()
  useEffect(() => {
    if (loaderData?.session && !clientSession) {
      authClient.hydrateSession(loaderData.session)
    }
  }, [loaderData?.session, clientSession])

  const activeSession = clientSession ?? loaderData?.session ?? null
  const user = activeSession?.user

  const [defaultModel, setDefaultModel] = useDefaultModel()
  const [defaultSkill, setDefaultSkill] = useDefaultSkill()
  const catalog = useModelCatalog()

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteSuccess, setDeleteSuccess] = useState(false)

  const formattedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null

  const handleSignOut = () => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => window.location.assign('/auth/sign-in'),
      },
    })
  }

  const handleConfirmDeleteAll = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteAllConversations()
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setDeleteSuccess(true)
      setDeleteDialogOpen(false)
    } catch (e) {
      console.error(e)
      setDeleteError('Gagal menghapus percakapan. Silakan coba lagi.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <MarketingLayout
      user={user}
      authState="authenticated"
      title="Pengaturan"
      subtitle="Kelola akun dan preferensi ZonaAI Anda."
      align="left"
    >
      {deleteSuccess && (
        <div
          data-testid="delete-success-banner"
          className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-hairline bg-sky-tint/50 p-4 text-[13px] text-notion-blue"
        >
          <div className="flex items-center gap-2">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Semua riwayat percakapan berhasil dihapus.</span>
          </div>
          <button
            type="button"
            onClick={() => setDeleteSuccess(false)}
            className="text-[12px] font-semibold underline hover:opacity-80"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Section 1: Akun */}
      <section
        className="settings-section-contain mb-10"
        aria-labelledby="heading-akun"
      >
        <h2
          id="heading-akun"
          className="mb-4 border-b border-hairline pb-2 text-[16px] font-semibold text-ink"
        >
          Akun
        </h2>

        <div className="space-y-4">
          {/* Profile summary card */}
          <div className="flex items-center gap-4 rounded-xl border border-hairline bg-paper/40 p-4">
            <UserAvatar user={user} className="h-14 w-14 text-[18px]" />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[16px] font-semibold text-ink">
                {user?.name ?? 'Pengguna'}
              </h3>
              <p className="truncate text-[13px] text-stone">
                {user?.email ?? ''}
              </p>
            </div>
          </div>

          {/* Account details */}
          <div className="divide-y divide-hairline rounded-xl border border-hairline bg-pure-white">
            {/* Email row */}
            <div className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center">
              <div>
                <div className="text-[14px] font-medium text-ink">Email</div>
                <div className="text-[12px] text-stone">
                  Dikelola oleh akun Google Anda (hanya-baca).
                </div>
              </div>
              <div className="self-start rounded-md border border-hairline bg-paper px-2.5 py-1 font-mono text-[13px] text-graphite sm:self-auto">
                {user?.email ?? '-'}
              </div>
            </div>

            {/* Connected provider row */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-[14px] font-medium text-ink">
                  Akun Terhubung
                </div>
                <div className="text-[12px] text-stone">
                  Metode autentikasi yang digunakan.
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-hairline bg-paper px-2.5 py-1 text-[13px] font-medium text-ink">
                <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Google
              </div>
            </div>

            {/* Plan row */}
            <div className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center">
              <div>
                <div className="text-[14px] font-medium text-ink">
                  Paket & Kredit
                </div>
                <div className="text-[12px] text-stone">
                  Kapasitas kredit komputasi multi-model Anda.
                </div>
              </div>
              <div className="flex items-center gap-3 self-start sm:self-auto">
                <span className="text-[13px] font-semibold text-ink">
                  Standar ({loaderData.creditBalance} Kredit)
                </span>
                <Link
                  to="/pricing"
                  className="rounded-md border border-notion-blue/30 bg-sky-tint px-2.5 py-1 text-[12px] font-semibold text-notion-blue transition-colors hover:bg-sky-tint/70"
                >
                  Lihat Paket
                </Link>
              </div>
            </div>

            {/* Account creation date */}
            {formattedDate && (
              <div className="flex items-center justify-between p-4">
                <div>
                  <div className="text-[14px] font-medium text-ink">
                    Tanggal Terdaftar
                  </div>
                  <div className="text-[12px] text-stone">
                    Waktu akun pertama kali diaktifkan.
                  </div>
                </div>
                <div className="text-[13px] text-graphite">{formattedDate}</div>
              </div>
            )}

            {/* Sign Out action */}
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="text-[14px] font-medium text-ink">
                  Keluar dari Akun
                </div>
                <div className="text-[12px] text-stone">
                  Akhiri sesi aktif Anda di peramban ini.
                </div>
              </div>
              <button
                type="button"
                data-testid="settings-sign-out"
                onClick={handleSignOut}
                className="inline-flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1.5 text-[13px] font-medium text-coral transition-colors hover:bg-danger-soft"
              >
                <HugeiconsIcon
                  icon={Logout01Icon}
                  size={15}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Keluar
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Preferensi */}
      <section
        className="settings-section-contain mb-10"
        aria-labelledby="heading-preferensi"
      >
        <h2
          id="heading-preferensi"
          className="mb-4 border-b border-hairline pb-2 text-[16px] font-semibold text-ink"
        >
          Preferensi
        </h2>

        <div className="divide-y divide-hairline rounded-xl border border-hairline bg-pure-white">
          {/* Model default */}
          <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div>
              <div className="text-[14px] font-medium text-ink">
                Model Default
              </div>
              <div className="text-[12px] text-stone">
                Model AI yang otomatis dipilih saat Anda membuat obrolan baru.
              </div>
            </div>
            <div className="w-full min-w-[220px] sm:w-auto">
              <select
                data-testid="default-model-select"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value)}
                className="w-full rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink focus:border-notion-blue focus:outline-none"
              >
                {catalog.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Skill default */}
          <div className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div>
              <div className="text-[14px] font-medium text-ink">
                Skill Default
              </div>
              <div className="text-[12px] text-stone">
                Mode respons default yang aktif saat membuat obrolan baru.
              </div>
            </div>
            <div className="w-full min-w-[220px] sm:w-auto">
              <select
                data-testid="default-skill-select"
                value={defaultSkill}
                onChange={(e) => setDefaultSkill(e.target.value)}
                className="w-full rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink focus:border-notion-blue focus:outline-none"
              >
                {SKILL_IDS.map((id) => {
                  const def = getSkillDefinition(id)
                  return (
                    <option key={def.id} value={def.id}>
                      {def.label}
                    </option>
                  )
                })}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Data & Privasi */}
      <section
        className="settings-section-contain mb-10"
        aria-labelledby="heading-data-privasi"
      >
        <h2
          id="heading-data-privasi"
          className="mb-4 border-b border-hairline pb-2 text-[16px] font-semibold text-ink"
        >
          Data & Privasi
        </h2>

        <div className="rounded-xl border border-hairline bg-pure-white p-4">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <div className="text-[14px] font-medium text-ink">
                Riwayat Percakapan
              </div>
              <div className="text-[12px] text-stone">
                Hapus seluruh riwayat obrolan, pesan, dan dokumen yang tersimpan
                di akun Anda.
              </div>
            </div>
            <button
              type="button"
              data-testid="delete-all-conversations-btn"
              onClick={() => setDeleteDialogOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-hairline px-3 py-1.5 text-[13px] font-medium text-coral transition-colors hover:bg-danger-soft sm:self-auto"
            >
              <HugeiconsIcon
                icon={Delete02Icon}
                size={15}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Hapus Semua Percakapan
            </button>
          </div>
        </div>
      </section>

      {/* Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Hapus Semua Percakapan?</DialogTitle>
            <DialogDescription>
              Tindakan ini akan menghapus secara permanen seluruh riwayat
              obrolan, pesan, dan berkas yang tersimpan di akun Anda. Tindakan
              ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>

          {deleteError && (
            <div className="rounded-md bg-danger-soft p-2.5 text-[13px] text-coral">
              {deleteError}
            </div>
          )}

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteDialogOpen(false)}
              className="rounded-md border border-hairline px-4 py-2 text-[13px] font-medium text-ink hover:bg-ink/5"
            >
              Batal
            </button>
            <button
              type="button"
              data-testid="confirm-delete-all-btn"
              disabled={deleting}
              onClick={handleConfirmDeleteAll}
              className="rounded-md bg-coral px-4 py-2 text-[13px] font-medium text-pure-white transition-colors hover:bg-coral/90 disabled:opacity-50"
            >
              {deleting ? 'Menghapus...' : 'Ya, Hapus Semua'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MarketingLayout>
  )
}
