import { createFileRoute } from '@tanstack/react-router'
import { MarketingLayout } from '@/components/layout/MarketingLayout'
import { HelpSection } from '@/components/pricing/HelpSection'
import { authClient } from '@/lib/auth/auth-client'
import { getOptionalSession } from '@/server/functions/session'

export const Route = createFileRoute('/bantuan')({
  loader: async () => {
    const session = await getOptionalSession()
    return { session }
  },
  component: BantuanPage,
})

function BantuanPage() {
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
      title="Ada yang bisa kami bantu?"
      subtitle="Temukan jawaban atau hubungi tim kami. Kami siap membantu kamu memaksimalkan Zona.ai."
    >
      <HelpSection />
    </MarketingLayout>
  )
}
