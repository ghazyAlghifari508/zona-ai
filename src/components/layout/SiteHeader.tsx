import { ArrowLeft01Icon, Login03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { ProfileMenu } from './ProfileMenu'

type Props = {
  user?: { name?: string | null; email?: string | null } | null
  authState: 'loading' | 'authenticated' | 'unauthenticated'
  onSignIn?: () => void
  signingIn?: boolean
}

export function SiteHeader({ user, authState, onSignIn, signingIn }: Props) {
  return (
    <div className="absolute top-0 right-0 z-40 flex items-center gap-1 px-4 py-3 lg:px-6">
      <Link
        to="/faq"
        className="flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
      >
        FAQ
      </Link>
      <Link
        to="/bantuan"
        className="flex h-8 items-center rounded-full px-3 text-[13px] font-medium text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
      >
        Bantuan
      </Link>

      <Link
        to="/"
        data-testid="back-to-chat"
        className="ml-1 flex h-8 items-center gap-1.5 rounded-full border border-hairline bg-pure-white px-2.5 text-[13px] font-medium text-ink transition-all duration-200 hover:bg-ink/5 active:scale-95"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          size={14}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        Kembali ke chat
      </Link>

      {authState === 'loading' ? (
        <div className="h-8 w-9 rounded-full bg-sandstone/30 animate-pulse" />
      ) : authState === 'authenticated' ? (
        <ProfileMenu user={user} />
      ) : (
        <button
          type="button"
          data-testid="site-sign-in"
          onClick={onSignIn}
          disabled={signingIn}
          className="ml-1 flex h-8 items-center gap-1.5 rounded-full bg-notion-blue px-4 text-[13px] font-semibold text-pure-white transition-colors duration-200 hover:bg-blue-hover disabled:opacity-60"
        >
          <HugeiconsIcon
            icon={Login03Icon}
            size={15}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          {signingIn ? 'Menghubungkan...' : 'Masuk'}
        </button>
      )}
    </div>
  )
}
