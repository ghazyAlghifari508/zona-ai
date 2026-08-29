import { createFileRoute, Link } from '@tanstack/react-router'
import { TriangleAlert } from 'lucide-react'

/**
 * Full-page error boundary fallback â€” 500 downtime only.
 * Cream Paper canvas, centered, "Kembali ke chat" link.
 */
export const Route = createFileRoute('/error')({
  component: ErrorPage,
})

function ErrorPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream-paper p-6">
      <div className="max-w-[440px] rounded-[50px] border border-hairline-mist bg-pure-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-hairline-mist bg-cream-paper">
          <TriangleAlert
            size={24}
            strokeWidth={1.75}
            className="text-ink-black"
            aria-hidden="true"
          />
        </div>
        <h1 className="mt-5 text-[30px] font-medium leading-tight text-ink-black">
          Terjadi kesalahan
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-stone-deep">
          Zona.ai sedang mengalami gangguan. Percakapan Anda tetap tersimpan.
          Silakan coba beberapa saat lagi.
        </p>
        <Link
          to="/chat"
          className="mt-6 inline-flex rounded-full border border-ink-black bg-pure-white px-5 py-2 text-[15px] font-medium text-ink-black hover:bg-sandstone"
        >
          Kembali ke chat
        </Link>
      </div>
    </div>
  )
}
