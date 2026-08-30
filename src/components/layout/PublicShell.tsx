import { Menu01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <nav className="mx-auto mt-4 flex max-w-[1200px] items-center justify-between rounded-lg border border-hairline bg-pure-white px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[13px] font-extrabold text-notion-blue">
            ZA
          </div>
          <span className="text-[15px] font-medium text-ink">Zona.ai</span>
        </div>
        <div className="flex gap-4 text-[15px] font-medium text-ink">
          <a href="/" className="rounded-md px-3 py-1 hover:bg-ink/5">
            Beranda
          </a>
          <a href="#features" className="rounded-md px-3 py-1 hover:bg-ink/5">
            Fitur
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Buka menu"
            className="flex h-10 w-10 items-center justify-center rounded-md text-ink hover:bg-ink/5"
          >
            <HugeiconsIcon
              icon={Menu01Icon}
              size={18}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
          <a
            href="/auth/sign-in"
            className="flex items-center gap-2 rounded-md border border-hairline-strong bg-pure-white px-4 py-2 text-[15px] font-medium text-ink hover:bg-ink/5"
          >
            Masuk
          </a>
        </div>
      </nav>
      <main className="mx-auto max-w-[1200px] px-6 py-10">{children}</main>
    </div>
  )
}
