import { Menu } from 'lucide-react'

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-cream-paper">
      <nav className="mx-auto mt-4 flex max-w-[1200px] items-center justify-between rounded-full border border-hairline-mist bg-pure-white px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-fresh-grass text-[15px] font-medium text-ink-black">
            Z
          </div>
          <span className="text-[15px] font-medium text-ink-black">
            Zona.ai
          </span>
        </div>
        <div className="flex gap-4 text-[15px] font-medium text-ink-black">
          <a href="/" className="rounded-full px-3 py-1 hover:bg-sandstone">
            Beranda
          </a>
          <a
            href="#features"
            className="rounded-full px-3 py-1 hover:bg-sandstone"
          >
            Fitur
          </a>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Buka menu"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-fresh-grass text-ink-black"
          >
            <Menu size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
          <a
            href="/auth/sign-in"
            className="flex items-center gap-2 rounded-full border border-ink-black bg-pure-white px-5 py-2 text-[15px] font-medium text-ink-black"
          >
            Masuk
            <span
              className="block h-4 w-4 rounded-full bg-sky-pop"
              aria-hidden="true"
            />
          </a>
        </div>
      </nav>
      <main className="mx-auto max-w-[1200px] px-6 py-10">{children}</main>
    </div>
  )
}
