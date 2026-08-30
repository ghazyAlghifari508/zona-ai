import { createFileRoute } from '@tanstack/react-router'
import { SiteHeader } from '@/components/layout/SiteHeader'
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
    <div className="min-h-screen bg-paper">
      <SiteHeader
        user={activeSession?.user}
        authState={authState}
        onSignIn={() => undefined}
      />
      <main>
        <PricingSection />
      </main>
    </div>
  )
}
