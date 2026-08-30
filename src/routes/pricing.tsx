import { createFileRoute } from '@tanstack/react-router'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { PricingSection } from '@/components/pricing/PricingSection'
import { authClient } from '@/lib/auth/auth-client'
import { getOptionalSession } from '@/server/functions/session'

export const Route = createFileRoute('/pricing')({
  loader: async () => {
    const session = await getOptionalSession()
    return { session }
  },
  component: PricingPage,
})

function PricingPage() {
  const loaderData = Route.useLoaderData()
  const serverSession = loaderData?.session
  const { data: clientSession, isPending } = authClient.useSession()

  if (typeof window !== 'undefined' && serverSession && !clientSession) {
    authClient.hydrateSession(serverSession)
  }

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
      <PricingSection />
    </MarketingLayout>
  )
}
