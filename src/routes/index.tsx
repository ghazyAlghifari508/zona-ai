import {
  Analytics01Icon,
  Compass01Icon,
  Idea01Icon,
  SourceCodeIcon,
  ZapIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Composer } from '@/components/chat/Composer'
import { GlobalNav } from '@/components/layout/GlobalNav'
import { WorkspaceShell } from '@/components/layout/WorkspaceShell'
import { authClient } from '@/lib/auth/auth-client'
import {
  saveGuestDraft,
  savePendingMessage,
  takeGuestDraft,
} from '@/lib/chat/guest-draft'
import { useSelectedModel } from '@/lib/models/preference'
import { createConversation } from '@/server/functions/conversations'
import {
  getCreditBalanceFn,
  resetDevCreditsFn,
} from '@/server/functions/credits'
import { getOptionalSession } from '@/server/functions/session'

const STARTERS = [
  {
    id: 'build',
    title: 'Build something',
    sub: 'Rancang produk, fitur, atau arsitektur aplikasi.',
    prompt: `Saya ingin merancang aplikasi SaaS manajemen inventaris berbasis AI untuk UMKM retail (toko baju & kelontong).

Tolong bantu susun:
1. Arsitektur sistem & teknologi stack yang scalable (frontend, backend, database, vector search).
2. Skema database PostgreSQL (tabel products, inventory_logs, reorder_alerts).
3. Alur rekomendasi restock otomatis menggunakan AI berbasis tren penjualan mingguan.
4. Rekomendasi UX flow ringkas untuk onboarding kasir dan pemilik toko.`,
    icon: SourceCodeIcon,
    iconClass: 'bg-sky-tint text-notion-blue',
  },
  {
    id: 'analyze',
    title: 'Analyze data & documents',
    sub: 'Bedah dokumen atau ringkas insight dari data kompleks.',
    prompt: `Berikut adalah ringkasan metrik kuartal terakhir dari startup e-commerce kami:
- GMV: Rp 4,2 Miliar (tumbuh 8% QoQ, target: 15%)
- Customer Acquisition Cost (CAC): Naik dari Rp 85.000 ke Rp 125.000
- Monthly Retention Rate M1: Turun dari 42% ke 31%
- Average Order Value (AOV): Rp 195.000 (naik 12%)

Analisis data di atas secara mendalam:
1. Temukan akar masalah (root cause) dari kenaikan CAC dan penurunan retensi.
2. 3 hipotesis bisnis mengapa AOV naik saat pertumbuhan GMV melambat.
3. Rekomendasi langkah taktis prioritas tinggi untuk 30 hari ke depan guna menstabilkan churn.`,
    icon: Analytics01Icon,
    iconClass: 'bg-[#fff0e8] text-coral',
  },
  {
    id: 'research',
    title: 'Research a topic',
    sub: 'Susun riset yang lebih terarah dan mudah dipahami.',
    prompt: `Buat riset komparatif mendalam antara arsitektur pgvector (PostgreSQL) vs dedicated vector database (seperti Qdrant atau Pinecone) untuk aplikasi multi-tenant AI workspace.

Bahas dalam format laporan terstruktur:
1. Analisis performa latency query HNSW/IVFFlat pada skala 5 juta embedding vectors.
2. Kompleksitas operasional, biaya infrastruktur (RAM & storage), dan kemudahan backup.
3. Manajemen isolasi data multi-tenant (Row Level Security vs metadata filtering).
4. Matriks keputusan: kapan harus tetap di pgvector dan kapan wajib migrasi ke dedicated vector DB.`,
    icon: Compass01Icon,
    iconClass: 'bg-[#fff4cf] text-[#8a5a00]',
  },
  {
    id: 'review',
    title: 'Review an idea',
    sub: 'Bedah ide, UX, positioning, dan risiko produk.',
    prompt: `Saya punya ide produk: "TalentPulse", platform AI mock interview interaktif untuk developer software di Asia Tenggara, dengan feedback realtime pada code architecture dan komunikasi verbal dalam Bahasa Inggris & Indonesia.

Tolong review ide ini dari perspektif Product & VC:
1. Evaluasi Value Proposition & Keunikan dibanding alternatif umum (ChatGPT biasa / MockMate).
2. Identifikasi 3 risiko terbesar (teknis, monetisasi, dan akuisisi user).
3. Saran positioning & model monetisasi (Freemium, Pay-per-interview, atau B2B ke Bootcamp).
4. Fitur Minimum Viable Product (MVP) yang paling esensial untuk validasi pasar dalam 2 minggu.`,
    icon: Idea01Icon,
    iconClass: 'bg-[#e9edff] text-midnight',
  },
] as const

export const Route = createFileRoute('/')({
  loader: async () => {
    const session = await getOptionalSession()
    const creditBalance = session?.user
      ? (await getCreditBalanceFn()).balance
      : 0
    return { session, creditBalance }
  },
  component: ChatHome,
})

function ChatHome() {
  const navigate = Route.useNavigate()
  const loaderData = Route.useLoaderData()
  const serverSession = loaderData?.session
  const serverCredits = loaderData?.creditBalance ?? 0
  const { data: clientSession, isPending } = authClient.useSession()

  // Hydrate Better Auth client store immediately on mount if server provided session
  if (typeof window !== 'undefined' && serverSession && !clientSession) {
    authClient.hydrateSession(serverSession)
  }

  // Active session: clientSession has priority if resolved, otherwise fallback to serverSession
  const activeSession = clientSession ?? serverSession ?? null

  type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'
  let authStatus: AuthStatus
  if (activeSession?.user) {
    authStatus = 'authenticated'
  } else if (serverSession === null || (!isPending && !clientSession?.user)) {
    authStatus = 'unauthenticated'
  } else {
    authStatus = 'loading'
  }
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [composerKey, setComposerKey] = useState(0)
  const [selectedModel, setSelectedModel] = useSelectedModel()
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareModelIds, setCompareModelIds] = useState<string[]>([])
  const [credits, setCredits] = useState(serverCredits)
  const [resettingCredits, setResettingCredits] = useState(false)

  const handleResetCredits = async () => {
    if (resettingCredits) return
    setResettingCredits(true)
    try {
      const res = await resetDevCreditsFn()
      setCredits(res.newBalance)
    } catch (e) {
      console.error(e)
    } finally {
      setResettingCredits(false)
    }
  }

  useEffect(() => setDraft(takeGuestDraft()), [])

  const signIn = async (content?: string) => {
    if (content) saveGuestDraft(content)
    setSigningIn(true)
    setAuthError(null)
    try {
      const result = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      })
      if (result.error)
        setAuthError(result.error.message ?? 'Gagal memulai login.')
    } catch {
      setAuthError('Gagal memulai login. Coba lagi.')
    } finally {
      setSigningIn(false)
    }
  }

  const handleSend = async (
    content: string,
    modelId: string,
    skillId: string,
    _attachmentIds?: string[],
    enableWebSearch = false,
  ) => {
    if (!activeSession?.user) {
      await signIn(content)
      return
    }
    setSubmitting(true)
    try {
      const conversation = await createConversation({
        data: { mode: 'normal' },
      })
      savePendingMessage({
        conversationId: conversation.id,
        content,
        modelId,
        skillId,
        enableWebSearch,
      })
      await navigate({
        to: '/chat/$conversationId',
        params: { conversationId: conversation.id },
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleSendCompare = async (
    content: string,
    modelIds: string[],
    skillId: string,
    _attachmentIds?: string[],
    enableWebSearch = false,
  ) => {
    if (!activeSession?.user) {
      await signIn(content)
      return
    }
    setSubmitting(true)
    try {
      const conversation = await createConversation({
        data: { mode: 'normal' },
      })
      savePendingMessage({
        conversationId: conversation.id,
        content,
        modelId: modelIds[0] ?? 'auto',
        modelIds,
        skillId,
        enableWebSearch,
      })
      await navigate({
        to: '/chat/$conversationId',
        params: { conversationId: conversation.id },
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <WorkspaceShell
      credits={credits}
      authState={authStatus}
      user={activeSession?.user}
      signingIn={signingIn}
      onSignIn={() => void signIn()}
      onNewChat={() => {
        setDraft('')
        setAuthError(null)
        setComposerKey((current) => current + 1)
      }}
      onSelectConversation={(conversationId) => {
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId },
        })
      }}
    >
      <div className="flex h-full min-h-full flex-col justify-between p-4 lg:p-6">
        <div className="mx-auto flex h-full w-full max-w-[920px] flex-col justify-between pt-12 lg:pt-0">
          <GlobalNav
            user={activeSession?.user}
            authState={authStatus}
            onSignIn={() => void signIn()}
            signingIn={signingIn}
            mode="app"
            leading={
              authStatus === 'authenticated' &&
              process.env.NODE_ENV !== 'production' ? (
                <button
                  type="button"
                  data-testid="reset-credits-btn"
                  onClick={handleResetCredits}
                  disabled={resettingCredits}
                  className="mr-1 flex min-h-8 items-center gap-1.5 rounded-full border border-hairline bg-pure-white px-3 text-[13px] font-medium text-ink transition-all duration-200 hover:border-hairline-strong hover:bg-ink/5 active:scale-95 disabled:opacity-50"
                  title="Reset ke 100 kredit (mode dev)"
                >
                  <HugeiconsIcon
                    icon={ZapIcon}
                    size={14}
                    strokeWidth={1.75}
                    className="text-amber-500"
                  />
                  {resettingCredits ? 'Mereset...' : 'Reset 100 Kredit'}
                </button>
              ) : undefined
            }
          />
          <div className="flex flex-1 items-center justify-center py-2 sm:px-4">
            <div className="w-full max-w-[820px] px-1 sm:px-4">
              <div className="flex flex-col items-center text-center">
                <h1 className="text-[clamp(26px,3.6vw,36px)] leading-[1.2] font-bold tracking-[-0.03em] text-ink">
                  Ada yang bisa dibantu?
                </h1>
                <p className="mt-2.5 max-w-[620px] font-editorial text-[16px] leading-[1.5] text-graphite">
                  Tanya apa saja, bandingkan ide, riset teknologi, bantu coding,
                  atau ubah gagasan mentah jadi sesuatu yang siap dibangun.
                </p>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {STARTERS.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    data-testid={`starter-${starter.id}`}
                    onClick={() => {
                      setDraft(starter.prompt)
                      setComposerKey((current) => current + 1)
                    }}
                    className="flex min-h-[104px] flex-col items-start justify-between rounded-lg border border-hairline bg-pure-white p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-hairline-strong"
                  >
                    <span
                      className={`flex h-[30px] w-[30px] items-center justify-center rounded-full ${starter.iconClass}`}
                    >
                      <HugeiconsIcon
                        icon={starter.icon}
                        size={15}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                    </span>
                    <span className="mt-3 block">
                      <span className="block text-[14px] font-semibold leading-[1.35] text-ink">
                        {starter.title}
                      </span>
                      <span className="mt-1 block text-[12px] leading-[1.4] text-stone">
                        {starter.sub}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-5">
                <Composer
                  key={composerKey}
                  placement="inline"
                  guest={authStatus === 'unauthenticated'}
                  onSignIn={() => void signIn()}
                  initialContent={draft}
                  isStreaming={submitting}
                  autoFocusInput
                  credits={credits}
                  modelValue={selectedModel}
                  onModelChange={setSelectedModel}
                  compareEnabled={compareEnabled}
                  onCompareEnabledChange={setCompareEnabled}
                  compareModelIds={compareModelIds}
                  onCompareModelIdsChange={setCompareModelIds}
                  onSend={handleSend}
                  onSendCompare={handleSendCompare}
                />
              </div>
              {authError && (
                <p
                  role="alert"
                  className="mt-3 text-center text-[13px] text-ink"
                >
                  {authError}
                </p>
              )}
              {authStatus === 'unauthenticated' && (
                <p className="mt-3 text-center text-[13px] text-graphite">
                  Pesanmu tetap tersimpan saat kamu masuk.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
