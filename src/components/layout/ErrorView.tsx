import {
  Alert02Icon,
  Home01Icon,
  RefreshIcon,
  ShieldAlertIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

export type ErrorViewProps = {
  error?: unknown
  reset?: () => void
}

function isForbiddenError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  if (
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  ) {
    return (err as { status: number }).status === 403
  }
  if ('code' in err && typeof (err as { code: unknown }).code === 'string') {
    return (err as { code: string }).code === 'ERR-003'
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    return (
      msg.includes('403') ||
      msg.includes('akses ditolak') ||
      msg.includes('forbidden')
    )
  }
  return false
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return 'Terjadi kendala yang tidak terduga pada sistem.'
}

export function ErrorView({ error, reset }: ErrorViewProps) {
  const [showDetails, setShowDetails] = useState(false)
  const isForbidden = isForbiddenError(error)
  const message = getErrorMessage(error)

  const handleRetry = () => {
    if (reset) {
      reset()
    } else {
      window.location.reload()
    }
  }

  return (
    <main
      data-testid="error-boundary-page"
      className="flex min-h-[calc(100vh-64px)] w-full items-center justify-center bg-paper p-6"
    >
      <div className="w-full max-w-[480px] rounded-xl border border-hairline bg-pure-white p-8 text-center sm:p-10">
        <div
          className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-hairline ${
            isForbidden
              ? 'bg-warning-soft text-marigold'
              : 'bg-danger-soft text-coral'
          }`}
        >
          <HugeiconsIcon
            icon={isForbidden ? ShieldAlertIcon : Alert02Icon}
            size={22}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>

        <div className="mt-5">
          <span
            className={`font-mono text-[11px] font-medium tracking-wider uppercase ${
              isForbidden ? 'text-marigold' : 'text-coral'
            }`}
          >
            {isForbidden ? '403 — Akses Ditolak' : '500 — Kendala Sistem'}
          </span>
          <h1 className="mt-1.5 text-[22px] font-bold tracking-tight text-ink">
            {isForbidden ? 'Akses Dibatasi' : 'Terjadi Kesalahan'}
          </h1>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-stone">
            {isForbidden
              ? 'Anda tidak memiliki hak akses administrator untuk membuka area ini. Silakan kembali ke ruang kerja utama.'
              : 'Zona.ai mengalami kendala teknis saat memproses permintaan Anda. Percakapan dan data Anda tetap aman.'}
          </p>
        </div>

        {Boolean(error) && !isForbidden && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="text-[12px] text-stone underline-offset-4 hover:underline"
            >
              {showDetails
                ? 'Sembunyikan detail teknis'
                : 'Lihat detail teknis'}
            </button>
            {showDetails && (
              <div className="mt-2 max-h-32 overflow-y-auto rounded border border-hairline bg-paper p-2.5 text-left font-mono text-[11px] text-ink/70 break-all">
                {message}
              </div>
            )}
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          {!isForbidden && (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-notion-blue px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-notion-blue/90"
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                size={15}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span>Coba Lagi</span>
            </button>
          )}
          <Link
            to="/"
            className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium transition-colors ${
              isForbidden
                ? 'bg-notion-blue text-white hover:bg-notion-blue/90'
                : 'border border-hairline bg-pure-white text-ink hover:bg-ink/5'
            }`}
          >
            <HugeiconsIcon
              icon={Home01Icon}
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Kembali ke Workspace</span>
          </Link>
          {isForbidden && (
            <Link
              to="/auth/sign-in"
              className="inline-flex items-center justify-center gap-2 rounded-md border border-hairline bg-pure-white px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-ink/5"
            >
              <span>Ganti Akun</span>
            </Link>
          )}
        </div>
      </div>
    </main>
  )
}
