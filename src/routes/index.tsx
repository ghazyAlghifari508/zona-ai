import {
  Compass01Icon,
  GitCompareIcon,
  Idea01Icon,
  SourceCodeIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Composer } from '@/components/chat/Composer'
import { WorkspaceShell } from '@/components/layout/WorkspaceShell'
import { authClient } from '@/lib/auth/auth-client'
import {
  saveGuestDraft,
  savePendingMessage,
  takeGuestDraft,
} from '@/lib/chat/guest-draft'
import { createConversation } from '@/server/functions/conversations'

const STARTERS = [
  {
    id: 'build',
    title: 'Build something',
    sub: 'Rancang produk, fitur, atau arsitektur aplikasi.',
    prompt: 'Bantu saya merancang aplikasi AI dari nol',
    icon: SourceCodeIcon,
    iconClass: 'bg-sky-tint text-notion-blue',
  },
  {
    id: 'compare',
    title: 'Compare AI models',
    sub: 'Bandingkan kualitas, speed, dan use case model.',
    prompt: 'Bandingkan beberapa model AI untuk coding',
    icon: GitCompareIcon,
    iconClass: 'bg-[#fff0e8] text-coral',
  },
  {
    id: 'research',
    title: 'Research a topic',
    sub: 'Susun riset yang lebih terarah dan mudah dipahami.',
    prompt: 'Bantu saya riset teknologi yang sedang relevan',
    icon: Compass01Icon,
    iconClass: 'bg-[#fff4cf] text-[#8a5a00]',
  },
  {
    id: 'review',
    title: 'Review an idea',
    sub: 'Bedah ide, UX, positioning, dan risiko produk.',
    prompt: 'Review ide produk saya dan kasih kritik',
    icon: Idea01Icon,
    iconClass: 'bg-[#e9edff] text-midnight',
  },
] as const

export const Route = createFileRoute('/')({
  component: ChatHome,
})

function ChatHome() {
  const navigate = Route.useNavigate()
  const { data: session } = authClient.useSession()
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [composerKey, setComposerKey] = useState(0)
  const [compareEnabled, setCompareEnabled] = useState(false)
  const [compareModelIds, setCompareModelIds] = useState<string[]>([])

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
    if (!session?.user) {
      await signIn(content)
      return
    }
    setSubmitting(true)
    try {
      const conversation = await createConversation({
        data: { mode: 'normal' },
      })
      savePendingMessage({ content, modelId, skillId, enableWebSearch })
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
    if (!session?.user) {
      await signIn(content)
      return
    }
    setSubmitting(true)
    try {
      const conversation = await createConversation({
        data: { mode: 'compare' },
      })
      savePendingMessage({
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
      guest={!session?.user}
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
      <div className="flex min-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex min-h-12 items-center justify-end">
          {!session?.user && (
            <button
              type="button"
              data-testid="home-sign-in"
              onClick={() => void signIn()}
              disabled={signingIn}
              className="flex min-h-9 items-center rounded-md bg-notion-blue px-4 text-[14px] font-medium text-pure-white transition-colors duration-200 hover:bg-blue-hover disabled:opacity-60"
            >
              {signingIn ? 'Menghubungkan...' : 'Masuk'}
            </button>
          )}
        </header>
        <div className="flex flex-1 items-center justify-center py-6 sm:px-6">
          <div className="-translate-y-[2vh] w-full max-w-[820px] px-1 sm:px-4">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[15px] font-extrabold tracking-[-0.04em] text-notion-blue">
              ZA
            </div>
            <h1 className="mt-6 max-w-[690px] text-[clamp(42px,5.8vw,72px)] leading-[1.02] font-bold tracking-[-0.048em] text-ink">
              Ada yang bisa{' '}
              <span className="inline-block -rotate-1 rounded-full bg-marigold px-[0.25em] pt-[0.02em] pb-[0.12em] leading-[0.9]">
                dibantu?
              </span>
            </h1>
            <p className="mt-5 max-w-[640px] font-editorial text-[18px] leading-[1.6] text-graphite">
              Tanya apa saja, bandingkan ide, riset teknologi, bantu coding,
              atau ubah gagasan mentah jadi sesuatu yang siap dibangun.
            </p>
            <div className="mt-10 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter.id}
                  type="button"
                  data-testid={`starter-${starter.id}`}
                  onClick={() => {
                    setDraft(starter.prompt)
                    setComposerKey((current) => current + 1)
                  }}
                  className="flex min-h-[118px] flex-col items-start justify-between rounded-lg border border-hairline bg-pure-white p-[18px] text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-hairline-strong"
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
                  <span className="mt-[18px] block">
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
            <div className="mt-6">
              <Composer
                key={composerKey}
                placement="inline"
                guest={!session?.user}
                onSignIn={() => void signIn()}
                initialContent={draft}
                isStreaming={submitting}
                autoFocusInput
                compareEnabled={compareEnabled}
                onCompareEnabledChange={setCompareEnabled}
                compareModelIds={compareModelIds}
                onCompareModelIdsChange={setCompareModelIds}
                onSend={handleSend}
                onSendCompare={handleSendCompare}
              />
            </div>
            {authError && (
              <p role="alert" className="mt-3 text-center text-[13px] text-ink">
                {authError}
              </p>
            )}
            {!session?.user && (
              <p className="mt-3 text-center text-[13px] text-graphite">
                Pesanmu tetap tersimpan saat kamu masuk.
              </p>
            )}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
