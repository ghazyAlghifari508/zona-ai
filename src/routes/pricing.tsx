import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { PricingSection } from '@/components/pricing/PricingSection'
import { authClient } from '@/lib/auth/auth-client'
import { getPricingSummaryFn } from '@/server/functions/payments'
import { getOptionalSession } from '@/server/functions/session'

export const Route = createFileRoute('/pricing')({
  staleTime: 60_000,
  loader: async () => {
    const session = await getOptionalSession()
    if (!session) return { session: null, summary: null }
    const summary = await getPricingSummaryFn()
    return { session, summary }
  },
  component: PricingPage,
})

function PricingPage() {
  const loaderData = Route.useLoaderData()
  const serverSession = loaderData?.session
  const summary = loaderData?.summary ?? null
  const { data: clientSession, isPending } = authClient.useSession()

  useEffect(() => {
    if (serverSession && !clientSession) {
      authClient.hydrateSession(serverSession)
    }
  }, [serverSession, clientSession])

  const activeSession = clientSession ?? serverSession ?? null
  const authState = activeSession?.user
    ? 'authenticated'
    : isPending && !activeSession
      ? 'loading'
      : 'unauthenticated'

  return (
    <MarketingLayout
      user={activeSession?.user}
      authState={authState}
      title={
        <>
          Pilih paket yang paling{' '}
          <span className="inline-block rounded-xl border border-dashed border-notion-blue bg-sky-tint px-2 py-0.5 capitalize">
            tepat
          </span>{' '}
          untukmu
        </>
      }
      subtitle="Mulai gratis, lalu naikkan kapasitas kredit dan fitur saat kamu butuh lebih banyak."
      maxWidth="wide"
    >
      <PricingSection
        activePlanId={summary?.activePlanId ?? 'free'}
        isAuthenticated={Boolean(activeSession?.user)}
      />
    </MarketingLayout>
  )
}
