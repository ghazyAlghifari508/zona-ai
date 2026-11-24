import { ArrowLeft01Icon, Login03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  QueryClient,
  QueryClientContext,
  useQuery,
} from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { type ReactNode, useContext } from 'react'
import type { PlanId } from '@/lib/pricing/plans'
import { getPricingSummaryFn } from '@/server/functions/payments'
import { ProfileMenu } from './ProfileMenu'

type Props = {
  user?: {
    name?: string | null
    email?: string | null
    image?: string | null
  } | null
  authState: 'loading' | 'authenticated' | 'unauthenticated'
  onSignIn?: () => void
  signingIn?: boolean
  /** Marketing pages render "Kembali ke chat"; app pages render "Upgrade" / "Pro" / "Ultra". */
  mode?: 'app' | 'marketing'
  /** Explicit plan tier override if already loaded by parent route or tests. */
  planId?: PlanId
  /** Optional slot for dev-only actions (e.g. Reset 100 Kredit). */
  leading?: ReactNode
  className?: string
}

const fallbackQueryClient = new QueryClient()

export function GlobalNav({
  user,
  authState,
  onSignIn,
  signingIn,
  mode = 'app',
  planId,
  leading,
  className,
}: Props) {
  const contextClient = useContext(QueryClientContext)
  const queryClient = contextClient ?? fallbackQueryClient

  const { data: pricingSummary } = useQuery(
    {
      queryKey: ['pricing-summary'],
      queryFn: () => getPricingSummaryFn(),
      enabled: Boolean(
        contextClient &&
          authState === 'authenticated' &&
          !planId &&
          mode === 'app',
      ),
      staleTime: 60_000,
    },
    queryClient,
  )

  const effectivePlanId: PlanId =
    planId ?? (pricingSummary?.activePlanId as PlanId | undefined) ?? 'free'

  const planLabel =
    effectivePlanId === 'ultra'
      ? 'Ultra'
      : effectivePlanId === 'pro'
        ? 'Pro'
        : 'Upgrade'

  return (
    <div
      className={
        className ??
        'fixed top-3 right-0 z-50 flex items-center gap-2.5 sm:gap-3 pr-4 lg:pr-6'
      }
    >
      {mode === 'app' && leading}
      <div className="hidden sm:flex items-center gap-1">
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
      </div>

      {mode === 'marketing' ? (
        <Link
          to="/"
          data-testid="back-to-chat"
          className="flex h-8 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-full border border-hairline bg-pure-white px-2.5 text-[13px] font-medium text-ink transition-all duration-200 hover:bg-ink/5 active:scale-95"
        >
          <HugeiconsIcon
            icon={ArrowLeft01Icon}
            size={14}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Kembali ke chat
        </Link>
      ) : (
        authState === 'authenticated' && (
          <Link
            to="/pricing"
            data-testid="topnav-upgrade"
            className="flex h-8 shrink-0 whitespace-nowrap items-center rounded-full border border-notion-blue/20 bg-sky-tint px-3 sm:px-4 text-[13px] font-semibold text-notion-blue transition-colors duration-200 hover:bg-sky-tint/70"
          >
            {planLabel}
          </Link>
        )
      )}

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
          className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-4 text-[13px] font-semibold text-white transition-colors duration-200 hover:bg-accent-hover disabled:opacity-60"
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
