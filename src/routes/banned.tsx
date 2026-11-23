import {
  Logout01Icon,
  Mail01Icon,
  ShieldAlertIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'
import { authClient } from '@/lib/auth/auth-client'

export const Route = createFileRoute('/banned')({
  component: BannedPage,
})

export function BannedPage() {
  const handleSignOut = () => {
    void authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.assign('/auth/sign-in')
        },
      },
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper p-6">
      <div className="w-full max-w-[440px] rounded-xl border border-hairline bg-pure-white p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-hairline bg-danger-soft text-coral">
          <HugeiconsIcon
            icon={ShieldAlertIcon}
            size={24}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>
        <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-ink">
          Akun Ditangguhkan
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-stone">
          Akses ke akun Zona.ai Anda telah ditangguhkan. Jika Anda merasa ini
          adalah kekeliruan, silakan hubungi tim dukungan kami untuk peninjauan
          lebih lanjut.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <a
            href="mailto:support@zona.ai"
            data-testid="banned-contact-support"
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md border border-hairline bg-pure-white px-4 text-[13px] font-medium text-ink transition-colors hover:bg-ink/5 focus:outline-none focus:ring-1 focus:ring-ink/20"
          >
            <HugeiconsIcon
              icon={Mail01Icon}
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Hubungi Bantuan
          </a>
          <button
            type="button"
            data-testid="banned-sign-out"
            onClick={handleSignOut}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 text-[13px] font-medium text-white transition-colors hover:bg-accent-hover focus:outline-none focus:ring-1 focus:ring-accent"
          >
            <HugeiconsIcon
              icon={Logout01Icon}
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Keluar
          </button>
        </div>
      </div>
    </main>
  )
}
