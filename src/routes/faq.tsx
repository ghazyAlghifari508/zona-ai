import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { FaqSection } from '@/components/pricing/FaqSection'
import { authClient } from '@/lib/auth/auth-client'
import { getOptionalSession } from '@/server/functions/session'

export const Route = createFileRoute('/faq')({
  staleTime: 60_000,
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
      title="Pertanyaan yang Sering Diajukan"
      subtitle="Jawaban seputar fitur, model AI, kredit, dan cara kerja Zona.ai."
    >
      <FaqSection />
    </MarketingLayout>
  )
}
