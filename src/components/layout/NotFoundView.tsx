import { Home01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'

export function NotFoundView() {
  return (
    <main
      data-testid="not-found-page"
      className="flex min-h-[calc(100vh-64px)] w-full items-center justify-center bg-paper p-6"
    >
      <div className="w-full max-w-[480px] rounded-xl border border-hairline bg-pure-white p-8 text-center sm:p-10">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-paper text-ink">
          <HugeiconsIcon
            icon={Search01Icon}
            size={22}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>

        <div className="mt-5">
          <span className="font-mono text-[11px] font-medium tracking-wider text-stone uppercase">
            404 — Tidak Ditemukan
          </span>
          <h1 className="mt-1.5 text-[22px] font-bold tracking-tight text-ink">
            Halaman Tidak Ditemukan
          </h1>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-relaxed text-stone">
            Halaman yang Anda tuju tidak tersedia, telah dipindahkan, atau
            alamat URL yang dimasukkan keliru.
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-notion-blue px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-notion-blue/90"
          >
            <HugeiconsIcon
              icon={Home01Icon}
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            <span>Kembali ke Workspace</span>
          </Link>
          <Link
            to="/bantuan"
            className="inline-flex items-center justify-center gap-2 rounded-md border border-hairline bg-pure-white px-4 py-2 text-[13px] font-medium text-ink transition-colors hover:bg-ink/5"
          >
            <span>Pusat Bantuan</span>
          </Link>
        </div>
      </div>
    </main>
  )
}
