import {
  Alert01Icon,
  Attachment01Icon,
  Bug01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  Idea01Icon,
  Loading03Icon,
  Message01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { authClient } from '@/lib/auth/auth-client'
import { submitFeedbackFn } from '@/server/functions/feedback'
import { getOptionalSession } from '@/server/functions/session'

export const Route = createFileRoute('/feedback')({
  staleTime: 60_000,
  loader: async () => {
    const session = await getOptionalSession()
    return { session }
  },
  component: FeedbackPage,
})

type FeedbackType = 'general' | 'feature' | 'bug'

const FEEDBACK_TYPES: Array<{
  id: FeedbackType
  title: string
  desc: string
  icon: typeof Message01Icon
}> = [
  {
    id: 'general',
    title: 'Feedback Umum',
    desc: 'Kritik, kesan, atau pertanyaan umum seputar Zona.ai.',
    icon: Message01Icon,
  },
  {
    id: 'feature',
    title: 'Saran Fitur',
    desc: 'Ide fitur baru atau peningkatan yang Anda inginkan.',
    icon: Idea01Icon,
  },
  {
    id: 'bug',
    title: 'Laporan Bug',
    desc: 'Kendala teknis, kerusakan tampilan, atau pesan error.',
    icon: Bug01Icon,
  },
]

const uploadResponseSchema = z.object({
  r2Key: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
})

const errorResponseSchema = z.object({
  message: z.string().optional(),
})

function FeedbackPage() {
  const loaderData = Route.useLoaderData()
  const serverSession = loaderData?.session
  const { data: clientSession, isPending } = authClient.useSession()

  if (typeof window !== 'undefined' && serverSession && !clientSession) {
    authClient.hydrateSession(serverSession)
  }

  const activeSession = clientSession ?? serverSession ?? null
  const authState = activeSession?.user
    ? 'authenticated'
    : isPending && !activeSession
      ? 'loading'
      : 'unauthenticated'

  const [type, setType] = useState<FeedbackType>('general')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [stepsToReproduce, setStepsToReproduce] = useState('')
  const [expectedBehavior, setExpectedBehavior] = useState('')
  const [actualBehavior, setActualBehavior] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    if (selected.size > 10 * 1024 * 1024) {
      setErrorMessage('Ukuran file maksimal 10MB.')
      return
    }

    const allowedMimes = [
      'image/png',
      'image/jpeg',
      'image/webp',
      'application/pdf',
    ]
    if (!allowedMimes.includes(selected.type)) {
      setErrorMessage(
        'Format file tidak didukung. Harap unggah gambar (PNG, JPG, WebP) atau dokumen PDF.',
      )
      return
    }

    setErrorMessage(null)
    setAttachment(selected)
  }

  const handleRemoveFile = () => {
    setAttachment(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeSession?.user) {
      setErrorMessage(
        'Silakan masuk terlebih dahulu untuk mengirimkan feedback.',
      )
      return
    }

    if (!title.trim()) {
      setErrorMessage('Judul feedback wajib diisi.')
      return
    }

    if (!description.trim()) {
      setErrorMessage('Deskripsi feedback wajib diisi.')
      return
    }

    setSubmitting(true)
    setErrorMessage(null)

    try {
      let attachmentR2Key: string | null = null
      let attachmentFileName: string | null = null
      let attachmentMimeType: string | null = null
      let attachmentFileSize: number | null = null

      if (attachment) {
        const formData = new FormData()
        formData.append('file', attachment)

        const uploadRes = await fetch('/api/feedback/upload', {
          method: 'POST',
          body: formData,
        })

        const rawJson: unknown = await uploadRes.json().catch(() => null)
        if (!uploadRes.ok) {
          const parsedErr = errorResponseSchema.safeParse(rawJson)
          throw new Error(
            parsedErr.success && parsedErr.data.message
              ? parsedErr.data.message
              : 'Gagal mengunggah file lampiran.',
          )
        }

        const parsedUpload = uploadResponseSchema.parse(rawJson)
        attachmentR2Key = parsedUpload.r2Key
        attachmentFileName = parsedUpload.fileName
        attachmentMimeType = parsedUpload.mimeType
        attachmentFileSize = parsedUpload.fileSize
      }

      await submitFeedbackFn({
        data: {
          type,
          title: title.trim(),
          description: description.trim(),
          stepsToReproduce:
            type === 'bug' && stepsToReproduce.trim()
              ? stepsToReproduce.trim()
              : null,
          expectedBehavior:
            type === 'bug' && expectedBehavior.trim()
              ? expectedBehavior.trim()
              : null,
          actualBehavior:
            type === 'bug' && actualBehavior.trim()
              ? actualBehavior.trim()
              : null,
          attachmentR2Key,
          attachmentFileName,
          attachmentMimeType,
          attachmentFileSize,
        },
      })

      setSubmitted(true)
      setTitle('')
      setDescription('')
      setStepsToReproduce('')
      setExpectedBehavior('')
      setActualBehavior('')
      setAttachment(null)
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Terjadi kesalahan saat mengirim feedback.'
      setErrorMessage(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetForm = () => {
    setSubmitted(false)
    setErrorMessage(null)
    setType('general')
    setTitle('')
    setDescription('')
    setStepsToReproduce('')
    setExpectedBehavior('')
    setActualBehavior('')
    setAttachment(null)
  }

  return (
    <MarketingLayout
      user={activeSession?.user}
      authState={authState}
      title="Pusat Masukan & Feedback"
      subtitle="Bantu kami menyempurnakan Zona.ai dengan membagikan saran, ide fitur, atau kendala yang Anda temukan."
      maxWidth="narrow"
    >
      <div className="mx-auto w-full max-w-2xl">
        {submitted ? (
          <div className="rounded-2xl border border-hairline bg-pure-white p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-success">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={28}
                strokeWidth={2}
                aria-hidden="true"
              />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-ink">
              Feedback Berhasil Dikirim
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-graphite">
              Terima kasih atas kontribusi Anda. Setiap masukan ditinjau
              langsung oleh tim pengembang kami untuk meningkatkan kualitas
              Zona.ai.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={handleResetForm}
                className="rounded-xl border border-hairline bg-pure-white px-4 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:border-hairline-strong hover:bg-paper"
              >
                Kirim Feedback Lain
              </button>
              <Link
                to="/"
                className="rounded-xl bg-notion-blue px-4 py-2 text-sm font-medium text-white transition-opacity duration-200 hover:opacity-90"
              >
                Kembali ke Workspace
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-hairline bg-pure-white p-6 sm:p-8">
            {!activeSession?.user && authState !== 'loading' && (
              <div className="mb-6 flex items-start gap-3 rounded-xl border border-hairline bg-paper p-4 text-left">
                <HugeiconsIcon
                  icon={Alert01Icon}
                  size={20}
                  className="mt-0.5 shrink-0 text-notion-blue"
                  aria-hidden="true"
                />
                <div className="flex-1 text-sm text-graphite">
                  <p className="font-medium text-ink">Perlu Masuk Akun</p>
                  <p className="mt-0.5">
                    Anda perlu masuk dengan akun Zona.ai agar kami dapat
                    menghubungi Anda terkait perkembangan feedback ini.
                  </p>
                  <Link
                    to="/auth/sign-in"
                    className="mt-2 inline-block font-medium text-notion-blue hover:underline"
                  >
                    Masuk Sekarang &rarr;
                  </Link>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-coral/30 bg-danger-soft px-4 py-3 text-sm text-coral">
                <HugeiconsIcon
                  icon={Alert01Icon}
                  size={18}
                  strokeWidth={2}
                  className="shrink-0"
                  aria-hidden="true"
                />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-stone">
                  Kategori Feedback
                </span>
                <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  {FEEDBACK_TYPES.map((t) => {
                    const isSelected = type === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setType(t.id)}
                        className={`flex flex-col rounded-xl border p-3.5 text-left transition-all duration-150 ${
                          isSelected
                            ? 'border-notion-blue bg-sky-tint/25 text-notion-blue'
                            : 'border-hairline bg-paper/60 text-graphite hover:border-hairline-strong hover:bg-paper'
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <HugeiconsIcon
                            icon={t.icon}
                            size={16}
                            strokeWidth={2}
                            className={
                              isSelected ? 'text-notion-blue' : 'text-stone'
                            }
                            aria-hidden="true"
                          />
                          <span
                            className={`text-sm font-semibold ${
                              isSelected ? 'text-ink' : 'text-ink'
                            }`}
                          >
                            {t.title}
                          </span>
                        </span>
                        <span className="mt-1 text-xs leading-relaxed text-stone">
                          {t.desc}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label
                  htmlFor="feedback-title"
                  className="block text-xs font-semibold uppercase tracking-wider text-stone"
                >
                  Judul <span className="text-coral">*</span>
                </label>
                <input
                  id="feedback-title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={
                    type === 'bug'
                      ? 'Contoh: Tombol download artifact tidak merespon'
                      : type === 'feature'
                        ? 'Contoh: Integrasi dengan Google Drive'
                        : 'Ringkasan masukan Anda'
                  }
                  required
                  maxLength={200}
                  className="mt-2 w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-stone/60 focus:border-notion-blue focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="feedback-description"
                  className="block text-xs font-semibold uppercase tracking-wider text-stone"
                >
                  Deskripsi <span className="text-coral">*</span>
                </label>
                <textarea
                  id="feedback-description"
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan secara detail apa yang Anda alami atau ide yang Anda usulkan..."
                  required
                  maxLength={5000}
                  className="mt-2 w-full rounded-xl border border-hairline bg-paper px-3.5 py-2.5 text-sm text-ink placeholder:text-stone/60 focus:border-notion-blue focus:outline-none"
                />
              </div>

              {type === 'bug' && (
                <div className="space-y-4 rounded-xl border border-hairline bg-paper/40 p-4">
                  <div className="border-b border-hairline pb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-stone">
                      Detail Kendala Teknis (Opsional)
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="steps-to-reproduce"
                      className="block text-xs font-medium text-graphite"
                    >
                      Langkah-langkah Mereproduksi Bug
                    </label>
                    <textarea
                      id="steps-to-reproduce"
                      rows={2}
                      value={stepsToReproduce}
                      onChange={(e) => setStepsToReproduce(e.target.value)}
                      placeholder="1. Masuk ke halaman...\n2. Klik opsi...\n3. Muncul pesan error..."
                      maxLength={3000}
                      className="mt-1.5 w-full rounded-xl border border-hairline bg-pure-white px-3 py-2 text-xs text-ink placeholder:text-stone/60 focus:border-notion-blue focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="expected-behavior"
                        className="block text-xs font-medium text-graphite"
                      >
                        Perilaku yang Diharapkan
                      </label>
                      <input
                        id="expected-behavior"
                        type="text"
                        value={expectedBehavior}
                        onChange={(e) => setExpectedBehavior(e.target.value)}
                        placeholder="Contoh: File langsung terunduh"
                        maxLength={2000}
                        className="mt-1.5 w-full rounded-xl border border-hairline bg-pure-white px-3 py-2 text-xs text-ink placeholder:text-stone/60 focus:border-notion-blue focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="actual-behavior"
                        className="block text-xs font-medium text-graphite"
                      >
                        Perilaku yang Terjadi
                      </label>
                      <input
                        id="actual-behavior"
                        type="text"
                        value={actualBehavior}
                        onChange={(e) => setActualBehavior(e.target.value)}
                        placeholder="Contoh: Tidak ada respon dan tombol macet"
                        maxLength={2000}
                        className="mt-1.5 w-full rounded-xl border border-hairline bg-pure-white px-3 py-2 text-xs text-ink placeholder:text-stone/60 focus:border-notion-blue focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <span className="block text-xs font-semibold uppercase tracking-wider text-stone">
                  Lampiran (Tangkapan Layar / PDF, Maksimal 10MB)
                </span>
                <div className="mt-2">
                  {attachment ? (
                    <div className="flex items-center justify-between rounded-xl border border-hairline bg-paper px-3.5 py-2.5">
                      <div className="flex items-center gap-2.5 truncate">
                        <HugeiconsIcon
                          icon={Attachment01Icon}
                          size={16}
                          className="shrink-0 text-notion-blue"
                          aria-hidden="true"
                        />
                        <span className="truncate text-xs font-medium text-ink">
                          {attachment.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-stone">
                          ({(attachment.size / 1024).toFixed(0)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveFile}
                        className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-stone hover:bg-danger-soft hover:text-coral"
                        title="Hapus file"
                      >
                        <HugeiconsIcon
                          icon={Delete02Icon}
                          size={14}
                          aria-hidden="true"
                        />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-hairline-strong bg-paper/50 px-4 py-4 text-xs font-medium text-graphite transition-colors hover:border-notion-blue hover:bg-sky-tint/10">
                      <HugeiconsIcon
                        icon={Attachment01Icon}
                        size={16}
                        className="text-stone"
                        aria-hidden="true"
                      />
                      <span>Pilih screenshot atau dokumen PDF</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting || !activeSession?.user}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-notion-blue px-5 py-3 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={16}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                      <span>Mengirimkan feedback...</span>
                    </>
                  ) : (
                    <span>Kirim Feedback</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </MarketingLayout>
  )
}
