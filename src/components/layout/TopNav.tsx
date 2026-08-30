import { Login03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { ProfileMenu } from './ProfileMenu'

type Props = {
  user?: { name?: string | null; email?: string | null } | null
  authState: 'loading' | 'authenticated' | 'unauthenticated'
  onSignIn?: () => void
  signingIn?: boolean
}

export function TopNav({ user, authState, onSignIn, signingIn }: Props) {
  if (authState === 'loading') {
    return (
      <div className="h-9 w-24 rounded-full bg-sandstone/30 animate-pulse" />
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <Link
        to="/faq"
        data-testid="topnav-faq"
        className="hidden h-9 items-center rounded-full px-3 text-[13px] font-medium text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink sm:flex"
      >
        FAQ
      </Link>
      <Link
        to="/bantuan"
        data-testid="topnav-bantuan"
        className="hidden h-9 items-center rounded-full px-3 text-[13px] font-medium text-ink/60 transition-colors duration-200 hover:bg-ink/5 hover:text-ink sm:flex"
      >
        Bantuan
      </Link>
      {authState === 'authenticated' ? (
        <>
          <Link
            to="/pricing"
            data-testid="topnav-upgrade"
            className="flex h-9 items-center rounded-full border border-notion-blue/20 bg-sky-tint px-4 text-[13px] font-semibold text-notion-blue transition-colors duration-200 hover:bg-sky-tint/70"
          >
            Upgrade
          </Link>
          <ProfileMenu user={user} />
        </>
      ) : (
        <button
          type="button"
          data-testid="topnav-sign-in"
          onClick={onSignIn}
          disabled={signingIn}
          className="flex h-9 items-center gap-1.5 rounded-full bg-notion-blue px-4 text-[13px] font-semibold text-pure-white transition-colors duration-200 hover:bg-blue-hover disabled:opacity-60"
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
