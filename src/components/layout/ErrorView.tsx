import { ArrowLeft01Icon, RefreshIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { BrandLogo } from '@/components/ui/BrandLogo'

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

function getErrorCode(err: unknown): string {
  if (typeof err !== 'object' || err === null) return 'ERR-000'
  if ('code' in err && typeof err.code === 'string') return err.code
  return 'ERR-000'
}

export function ErrorView({ error, reset }: ErrorViewProps) {
  const isForbidden = isForbiddenError(error)

  if (isForbidden) {
    return <ForbiddenView />
  }

  return <SystemErrorView error={error} reset={reset} />
}

function ForbiddenView() {
  return (
    <main
      data-testid="error-boundary-page"
      className="flex min-h-screen min-h-dvh w-full flex-col items-center justify-center bg-white p-6 sm:p-10 dark:bg-[#141414]"
    >
      <div className="flex max-w-[420px] flex-col items-center text-center">
        <BrandLogo size={28} className="mb-6 opacity-90" alt="ZonaAI" />

        <div className="select-none font-bold text-[72px] leading-none tracking-[-0.04em] text-ink sm:text-[88px]">
          403
        </div>

        <h1 className="mt-4 font-semibold text-[18px] tracking-tight text-ink sm:text-[20px]">
          Akses Dibatasi
        </h1>

        <p className="mt-2 max-w-[340px] text-[14px] leading-relaxed text-stone">
          Akun ini tidak memiliki akses ke area admin.
        </p>

        <div className="mt-8">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-notion-blue px-4 py-2.5 font-medium text-[14px] text-white transition-colors hover:bg-notion-blue/90 active:scale-[0.98]"
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Kembali ke Workspace</span>
          </Link>
        </div>
      </div>
    </main>
  )
}

function SystemErrorView({
  error,
  reset,
}: {
  error?: unknown
  reset?: () => void
}) {
  const [showDetails, setShowDetails] = useState(false)
  const errorCode = getErrorCode(error)

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
      className="flex min-h-screen min-h-dvh w-full flex-col items-center justify-center bg-white p-6 sm:p-10 dark:bg-[#141414]"
    >
      <div className="flex max-w-[420px] flex-col items-center text-center">
        <BrandLogo size={28} className="mb-6 opacity-90" alt="ZonaAI" />

        <div className="select-none font-bold text-[72px] leading-none tracking-[-0.04em] text-ink sm:text-[88px]">
          500
        </div>

        <h1 className="mt-4 font-semibold text-[18px] tracking-tight text-ink sm:text-[20px]">
          Terjadi Kesalahan
        </h1>

        <p className="mt-2 max-w-[340px] text-[14px] leading-relaxed text-stone">
          Zona.ai mengalami kendala teknis saat memproses permintaan Anda.
          Percakapan dan data Anda tetap aman.
        </p>

        {Boolean(error) && (
          <div className="mt-4 w-full">
            <button
              type="button"
              onClick={() => setShowDetails((prev) => !prev)}
              className="text-[13px] text-stone underline-offset-4 hover:underline"
            >
              {showDetails
                ? 'Sembunyikan detail teknis'
                : 'Lihat detail teknis'}
            </button>
            {showDetails && (
              <div className="mt-2.5 max-h-32 overflow-y-auto rounded border border-hairline bg-paper p-3 text-left font-mono text-[12px] text-graphite break-all dark:bg-pure-white">
                Kode error: {errorCode}
              </div>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-notion-blue px-4 py-2.5 font-medium text-[14px] text-white transition-colors hover:bg-notion-blue/90 active:scale-[0.98]"
          >
            <HugeiconsIcon
              icon={RefreshIcon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Coba Lagi</span>
          </button>

          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-hairline bg-pure-white px-4 py-2.5 font-medium text-[14px] text-ink transition-colors hover:bg-ink/5 active:scale-[0.98]"
          >
            <HugeiconsIcon
              icon={ArrowLeft01Icon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Kembali ke Workspace</span>
          </Link>
        </div>
      </div>
    </main>
  )
}
