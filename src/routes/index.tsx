import { createFileRoute } from '@tanstack/react-router'
import { PublicShell } from '@/components/layout/PublicShell'

export const Route = createFileRoute('/')({
  component: Landing,
})

function Landing() {
  return (
    <PublicShell>
      <h1 className="text-[144px] font-medium leading-[0.95] tracking-[-8.64px] text-ink-black">
        Zona.ai — Kertas cream, gagasan jernih.
      </h1>
      <p className="mt-4 max-w-[600px] text-[20px] text-ink-black">
        Ruang kerja editorial yang lapang untuk merangkai gagasan di atas kanvas
        cream yang hangat.
      </p>
      <div className="mt-8 grid gap-4">
        <div className="rounded-[50px] border border-hairline-mist bg-pure-white p-6">
          <h2 className="text-[30px] font-medium text-ink-black">
            Mulai dengan tenang
          </h2>
          <p className="text-[17px] text-ink-black">
            Kanvas lapang, tipografi Inter, dan permukaan putih yang mengapung —
            fondasi hangat untuk pekerjaan berikutnya.
          </p>
        </div>
      </div>
    </PublicShell>
  )
}
