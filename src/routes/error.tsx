import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, Link } from '@tanstack/react-router'

/**
 * Full-page error boundary fallback — 500 downtime only.
 * Cream Paper canvas, centered, "Kembali ke chat" link.
 */
export const Route = createFileRoute('/error')({
  component: ErrorPage,
})

function ErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="max-w-[440px] rounded-lg border border-hairline bg-pure-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-paper">
          <HugeiconsIcon
            icon={Alert02Icon}
            size={24}
            strokeWidth={1.75}
            className="text-ink"
            aria-hidden="true"
          />
        </div>
        <h1 className="mt-5 text-[30px] font-medium leading-tight text-ink">
          Terjadi kesalahan
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-stone">
          Zona.ai sedang mengalami gangguan. Percakapan Anda tetap tersimpan.
          Silakan coba beberapa saat lagi.
        </p>
        <Link
          to="/chat"
          className="mt-6 inline-flex rounded-md border border-hairline-strong bg-pure-white px-5 py-2 text-[15px] font-medium text-ink hover:bg-ink/5"
        >
          Kembali ke chat
        </Link>
      </div>
    </div>
  )
}
