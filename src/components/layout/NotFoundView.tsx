import { ArrowLeft01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { BrandLogo } from '@/components/ui/BrandLogo'

export function NotFoundView() {
  return (
    <main
      data-testid="not-found-page"
      className="flex min-h-screen min-h-dvh w-full flex-col items-center justify-center bg-white p-6 sm:p-10 dark:bg-[#141414]"
    >
      <div className="flex max-w-[420px] flex-col items-center text-center">
        <BrandLogo size={28} className="mb-6 opacity-90" alt="ZonaAI" />

        <div className="select-none font-bold text-[72px] leading-none tracking-[-0.04em] text-ink sm:text-[88px]">
          404
        </div>

        <h1 className="mt-4 font-semibold text-[18px] tracking-tight text-ink sm:text-[20px]">
          Halaman ini tidak ditemukan.
        </h1>

        <p className="mt-2 max-w-[340px] text-[14px] leading-relaxed text-stone">
          Mungkin link-nya sudah berubah atau alamat yang kamu buka salah.
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
            <span>Kembali ke ZonaAI</span>
          </Link>
        </div>
      </div>
    </main>
  )
}
