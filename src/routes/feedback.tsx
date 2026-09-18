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
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    if (serverSession && !clientSession) {
      authClient.hydrateSession(serverSession)
    }
  }, [serverSession, clientSession])

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
      <div className="mx-auto w-full max-w-xl">
        {submitted ? (
          <div className="rounded-xl border border-hairline bg-pure-white p-8 text-center">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-success/10 text-success">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={22}
                strokeWidth={2}
                aria-hidden="true"
              />
            </div>
            <h2 className="mt-3.5 text-lg font-semibold text-ink">
              Feedback Berhasil Dikirim
            </h2>
            <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-graphite">
              Terima kasih atas kontribusi Anda. Setiap masukan ditinjau
              langsung oleh tim pengembang kami untuk meningkatkan kualitas
              Zona.ai.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button
                type="button"
                onClick={handleResetForm}
                className="rounded-lg border border-hairline bg-pure-white px-3.5 py-1.5 text-xs font-medium text-ink transition-colors hover:border-hairline-strong hover:bg-paper"
              >
                Kirim Feedback Lain
              </button>
              <Link
                to="/"
                className="rounded-lg bg-notion-blue px-3.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
              >
                Kembali ke Workspace
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-hairline bg-pure-white p-6 sm:p-7 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
            {!activeSession?.user && authState !== 'loading' && (
              <div className="mb-5 flex items-center justify-between rounded-lg border border-hairline bg-paper px-3.5 py-2.5 text-xs text-graphite">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon
                    icon={Alert01Icon}
                    size={15}
                    className="shrink-0 text-stone"
                    aria-hidden="true"
                  />
                  <span>
                    Masuk dengan akun Zona.ai untuk mengirimkan feedback.
                  </span>
                </div>
                <Link
                  to="/auth/sign-in"
                  className="ml-2 shrink-0 font-medium text-notion-blue hover:underline"
                >
                  Masuk &rarr;
                </Link>
              </div>
            )}

            {errorMessage && (
              <div className="mb-5 flex items-center gap-2 rounded-lg border border-coral/30 bg-danger-soft px-3.5 py-2.5 text-xs text-coral">
                <HugeiconsIcon
                  icon={Alert01Icon}
                  size={15}
                  strokeWidth={2}
                  className="shrink-0"
                  aria-hidden="true"
                />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <span className="mb-2 block text-xs font-semibold text-graphite">
                  Jenis Feedback
                </span>
                <div className="inline-flex flex-wrap rounded-lg border border-hairline bg-paper p-1 text-xs">
                  {FEEDBACK_TYPES.map((t) => {
                    const isSelected = type === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setType(t.id)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-all ${
                          isSelected
                            ? 'bg-pure-white font-semibold text-ink shadow-[0_1px_2px_rgba(0,0,0,0.04)]'
                            : 'text-stone hover:text-ink'
                        }`}
                      >
                        <HugeiconsIcon
                          icon={t.icon}
                          size={14}
                          strokeWidth={2}
                          className={
                            isSelected ? 'text-notion-blue' : 'text-stone'
                          }
                          aria-hidden="true"
                        />
                        <span>{t.title}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="mt-1.5 text-xs text-stone">
                  {FEEDBACK_TYPES.find((t) => t.id === type)?.desc}
                </p>
              </div>

              <div>
                <label
                  htmlFor="feedback-title"
                  className="mb-1.5 block text-xs font-semibold text-graphite"
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
                  className="w-full rounded-lg border border-hairline bg-paper px-3.5 py-2 text-sm text-ink placeholder:text-stone/60 transition-colors focus:border-notion-blue focus:bg-pure-white focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="feedback-description"
                  className="mb-1.5 block text-xs font-semibold text-graphite"
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
                  className="w-full rounded-lg border border-hairline bg-paper px-3.5 py-2 text-sm text-ink placeholder:text-stone/60 transition-colors focus:border-notion-blue focus:bg-pure-white focus:outline-none"
                />
              </div>

              {type === 'bug' && (
                <div className="space-y-3.5 border-l-2 border-hairline pl-3.5">
                  <span className="block text-xs font-semibold text-graphite">
                    Detail Kendala Teknis{' '}
                    <span className="font-normal text-stone">(Opsional)</span>
                  </span>

                  <div>
                    <label
                      htmlFor="steps-to-reproduce"
                      className="mb-1 block text-xs font-medium text-stone"
                    >
                      Langkah-langkah mereproduksi
                    </label>
                    <textarea
                      id="steps-to-reproduce"
                      rows={2}
                      value={stepsToReproduce}
                      onChange={(e) => setStepsToReproduce(e.target.value)}
                      placeholder="1. Buka halaman...\n2. Klik opsi...\n3. Muncul error..."
                      maxLength={3000}
                      className="w-full rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-stone/60 transition-colors focus:border-notion-blue focus:bg-pure-white focus:outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="expected-behavior"
                        className="mb-1 block text-xs font-medium text-stone"
                      >
                        Perilaku yang diharapkan
                      </label>
                      <input
                        id="expected-behavior"
                        type="text"
                        value={expectedBehavior}
                        onChange={(e) => setExpectedBehavior(e.target.value)}
                        placeholder="Contoh: File terunduh"
                        maxLength={2000}
                        className="w-full rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-stone/60 transition-colors focus:border-notion-blue focus:bg-pure-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="actual-behavior"
                        className="mb-1 block text-xs font-medium text-stone"
                      >
                        Perilaku yang terjadi
                      </label>
                      <input
                        id="actual-behavior"
                        type="text"
                        value={actualBehavior}
                        onChange={(e) => setActualBehavior(e.target.value)}
                        placeholder="Contoh: Tombol macet"
                        maxLength={2000}
                        className="w-full rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs text-ink placeholder:text-stone/60 transition-colors focus:border-notion-blue focus:bg-pure-white focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <span className="mb-1.5 block text-xs font-semibold text-graphite">
                  Lampiran{' '}
                  <span className="font-normal text-stone">
                    (Opsional, maks. 10MB)
                  </span>
                </span>
                {attachment ? (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs">
                    <HugeiconsIcon
                      icon={Attachment01Icon}
                      size={14}
                      className="shrink-0 text-notion-blue"
                      aria-hidden="true"
                    />
                    <span className="max-w-[220px] truncate font-medium text-ink">
                      {attachment.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-stone">
                      ({(attachment.size / 1024).toFixed(0)} KB)
                    </span>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="ml-1 inline-flex items-center text-stone transition-colors hover:text-coral"
                      title="Hapus file"
                      aria-label="Hapus file lampiran"
                    >
                      <HugeiconsIcon
                        icon={Delete02Icon}
                        size={13}
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-hairline bg-paper px-3 py-1.5 text-xs font-medium text-graphite transition-colors hover:border-hairline-strong hover:bg-paper-dark hover:text-ink">
                    <HugeiconsIcon
                      icon={Attachment01Icon}
                      size={14}
                      className="text-stone"
                      aria-hidden="true"
                    />
                    <span>Tambah lampiran (gambar atau PDF)</span>
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div className="flex items-center justify-end border-t border-hairline pt-4">
                <button
                  type="submit"
                  disabled={submitting || !activeSession?.user}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-notion-blue px-4 py-2 text-sm font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <>
                      <HugeiconsIcon
                        icon={Loading03Icon}
                        size={14}
                        className="animate-spin"
                        aria-hidden="true"
                      />
                      <span>Mengirimkan...</span>
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
