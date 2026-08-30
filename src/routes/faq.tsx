import { createFileRoute } from '@tanstack/react-router'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { FaqSection } from '@/components/pricing/FaqSection'
import { authClient } from '@/lib/auth/auth-client'
import { getOptionalSession } from '@/server/functions/session'

export const Route = createFileRoute('/faq')({
  loader: async () => {
    const session = await getOptionalSession()
    return { session }
  },
  component: FaqPage,
})

function FaqPage() {
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
    <div className="min-h-screen bg-pure-white">
      <SiteHeader
        user={activeSession?.user}
        authState={authState}
        onSignIn={() => undefined}
      />
      <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
        <FaqSection />
      </main>
    </div>
  )
}
