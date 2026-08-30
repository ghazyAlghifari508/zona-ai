import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useEffect, useEffectEvent, useState } from 'react'
import { Composer } from '@/components/chat/Composer'
import { type ChatMessage, MessageList } from '@/components/chat/MessageList'
import { WorkspaceShell } from '@/components/layout/WorkspaceShell'
import { parseStreamEvent } from '@/lib/ai/multiplex'
import {
  type PendingMessage,
  takePendingMessageForConversation,
} from '@/lib/chat/guest-draft'
import { hydrateMessages } from '@/lib/utils/conversation-hydration'
import {
  retryGeneration,
  sendCompareMessage,
  sendMessage,
  stopGeneration,
} from '@/server/functions/chat'
import { getConversation } from '@/server/functions/conversations'
import { getCreditBalanceFn } from '@/server/functions/credits'
import { getMessages } from '@/server/functions/messages'
import { getCurrentSession } from '@/server/functions/session'

export const Route = createFileRoute('/chat/$conversationId')({
  beforeLoad: async () => {
    try {
      await getCurrentSession()
    } catch {
      throw redirect({ to: '/auth/sign-in' })
    }
  },
  loader: async ({ params }) => {
    const [conversation, persistedMessages, credit] = await Promise.all([
      getConversation({ data: { id: params.conversationId } }),
      getMessages({ data: { conversationId: params.conversationId } }),
      getCreditBalanceFn(),
    ])
    return { conversation, persistedMessages, creditBalance: credit.balance }
  },
  errorComponent: ConversationError,
  component: ConversationRoute,
})

function ConversationRoute() {
  const { conversationId } = Route.useParams()
  return <ChatThread key={conversationId} />
}

function ConversationError() {
  return (
    <WorkspaceShell>
      <div className="flex min-h-[60vh] items-center justify-center text-center">
        <div>
          <h1 className="text-[30px] font-medium text-ink">
            Percakapan tidak ditemukan
          </h1>
          <p className="mt-2 text-[15px] text-stone">
            Percakapan ini tidak tersedia atau tidak dapat diakses.
          </p>
          <Link
            to="/chat"
            className="mt-5 inline-flex rounded-md border border-hairline-strong bg-pure-white px-4 py-2 text-[14px] font-medium text-ink hover:bg-ink/5"
          >
            Kembali ke chat
          </Link>
        </div>
      </div>
    </WorkspaceShell>
  )
}

function ChatThread() {
  const { conversationId } = Route.useParams()
  const { persistedMessages, creditBalance } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const queryClient = useQueryClient()
  const refreshConversationList = () => {
    void queryClient.invalidateQueries({ queryKey: ['conversations'] })
  }
  const refreshCredits = async () => {
    const res = await getCreditBalanceFn()
    setCredits(res.balance)
  }
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const typed = persistedMessages as Parameters<typeof hydrateMessages>[0]
    return hydrateMessages(typed)
  })
  const [isStreaming, setIsStreaming] = useState(false)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [webSearchToast, setWebSearchToast] = useState(false)
  const [credits, setCredits] = useState(creditBalance)

  const [mode, setMode] = useState<'normal' | 'compare'>('normal')
  const [compareModelIds, setCompareModelIds] = useState<string[]>([])
  const [modelId, setModelId] = useState('auto')

  const compareEnabled = mode === 'compare'
  const setCompareEnabled = (enabled: boolean) =>
    setMode(enabled ? 'compare' : 'normal')
  const handleSend = async (
    content: string,
    modelId: string,
    skillId: string,
    attachmentIds?: string[],
    enableWebSearch?: boolean,
  ) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }
    const assistantId = crypto.randomUUID()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      modelId,
      streaming: true,
    }
    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setIsStreaming(true)
    try {
      const response = (await sendMessage({
        data: {
          conversationId,
          modelId,
          skillId,
          content,
          attachmentIds,
          enableWebSearch: enableWebSearch ?? false,
        },
      })) as Response
      const genId = response.headers.get('X-Generation-Id')
      const routerModelId = response.headers.get('X-Router-Model-Id')
      const routingReason = response.headers.get('X-Routing-Reason')
      const webSearchStatus = response.headers.get('X-Web-Search-Status')
      refreshConversationList()
      setTimeout(refreshConversationList, 3000)
      if (webSearchStatus === 'unavailable') {
        setWebSearchToast(true)
        setTimeout(() => setWebSearchToast(false), 3000)
      }
      if (genId) setGenerationId(genId)
      if (routerModelId && modelId === 'auto') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  routerModelId,
                  routingReason: routingReason ?? undefined,
                }
              : m,
          ),
        )
      }
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: text, streaming: false }
              : m,
          ),
        )
        setIsStreaming(false)
        setGenerationId(null)
        void refreshCredits()
        return
      }
      const decoder = new TextDecoder()
      let fullText = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        let delta = chunk
        if (chunk.includes('data:')) {
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                if (parsed.type === 'text-delta' && parsed.delta)
                  delta = parsed.delta
                else if (parsed.textDelta) delta = parsed.textDelta
                else if (typeof parsed === 'string') delta = parsed
                else continue
              } catch {
                delta = data
              }
              fullText += delta
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId ? { ...m, content: fullText } : m,
                ),
              )
            }
          }
        } else {
          fullText += delta
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: fullText } : m,
            ),
          )
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: fullText, streaming: false }
            : m,
        ),
      )
      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      refreshConversationList()
      void refreshCredits()
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      if (err.status === 402 || err.code === 'ERR-019') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? {
                  ...m,
                  content: 'Kredit tidak mencukupi. Silakan reset kredit.',
                  streaming: false,
                }
              : m,
          ),
        )
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${err.message}`, streaming: false }
              : m,
          ),
        )
      }
    } finally {
      setIsStreaming(false)
      setGenerationId(null)
    }
  }

  const handleSendCompare = async (
    content: string,
    modelIds: string[],
    skillId: string,
    attachmentIds?: string[],
    enableWebSearch?: boolean,
  ) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }
    const compareAssistantId = crypto.randomUUID()
    const initialGens = modelIds.map((mid) => ({
      id: crypto.randomUUID(),
      modelId: mid,
      status: 'streaming',
      content: '',
    }))
    const compareMsg: ChatMessage = {
      id: compareAssistantId,
      role: 'assistant',
      content: '',
      streaming: true,
      compareGenerations: initialGens,
    }
    setMessages((prev) => [...prev, userMsg, compareMsg])
    setIsStreaming(true)

    const updateCompareGen = (
      updater: (
        gens: NonNullable<ChatMessage['compareGenerations']>,
      ) => NonNullable<ChatMessage['compareGenerations']>,
    ) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === compareAssistantId && m.compareGenerations
            ? { ...m, compareGenerations: updater(m.compareGenerations) }
            : m,
        ),
      )
    }

    try {
      const response = (await sendCompareMessage({
        data: {
          conversationId,
          modelIds,
          skillId,
          content,
          attachmentIds,
          enableWebSearch: enableWebSearch ?? false,
        },
      })) as Response

      if (response.headers.get('X-Web-Search-Status') === 'unavailable') {
        setWebSearchToast(true)
        setTimeout(() => setWebSearchToast(false), 3000)
      }
      refreshConversationList()
      setTimeout(refreshConversationList, 3000)

      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        updateCompareGen((gens) =>
          gens.map((g) => ({ ...g, content: text, status: 'completed' })),
        )
        setMessages((prev) =>
          prev.map((m) =>
            m.id === compareAssistantId ? { ...m, streaming: false } : m,
          ),
        )
        setIsStreaming(false)
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      const genIdToIndex = new Map<string, number>()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const lines = part.split('\n')
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const jsonStr = line.slice(5).trim()
            if (!jsonStr || jsonStr === '[DONE]') continue
            try {
              const raw = JSON.parse(jsonStr)
              const event = parseStreamEvent(raw)

              if (event.type === 'generation-start') {
                const modelIdx = modelIds.indexOf(event.modelId)
                if (modelIdx !== -1) {
                  genIdToIndex.set(event.generationId, modelIdx)
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === modelIdx ? { ...g, id: event.generationId } : g,
                    ),
                  )
                }
              } else if (event.type === 'text-delta') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === idx
                        ? { ...g, content: (g.content ?? '') + event.text }
                        : g,
                    ),
                  )
                }
              } else if (event.type === 'generation-finish') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === idx ? { ...g, status: 'completed' } : g,
                    ),
                  )
                }
              } else if (event.type === 'generation-error') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === idx
                        ? {
                            ...g,
                            status: 'failed',
                            error: { message: event.error, code: event.code },
                            content: event.error,
                          }
                        : g,
                    ),
                  )
                }
              } else if (event.type === 'usage') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  updateCompareGen((gens) =>
                    gens.map((g, i) =>
                      i === idx
                        ? {
                            ...g,
                            promptTokens: event.promptTokens,
                            completionTokens: event.completionTokens,
                            totalTokens: event.totalTokens,
                          }
                        : g,
                    ),
                  )
                }
              }
            } catch {}
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === compareAssistantId
            ? {
                ...m,
                streaming: false,
                compareGenerations: m.compareGenerations?.map((g) =>
                  g.status === 'streaming' ? { ...g, status: 'completed' } : g,
                ),
              }
            : m,
        ),
      )

      const persisted = await getMessages({ data: { conversationId } })
      setMessages(
        hydrateMessages(persisted as Parameters<typeof hydrateMessages>[0]),
      )
      refreshConversationList()
      void refreshCredits()
    } catch (e) {
      console.error('[CLIENT handleSendCompare CAUGHT ERROR]:', e)
      const err = e as Error & { status?: number; code?: string }
      const errorContent =
        err.status === 402 || err.code === 'ERR-019'
          ? 'Kredit tidak mencukupi'
          : `Error: ${err.message}`
      setMessages((prev) =>
        prev.map((m) =>
          m.id === compareAssistantId
            ? {
                ...m,
                streaming: false,
                compareGenerations: m.compareGenerations?.map((g) =>
                  g.status === 'streaming'
                    ? {
                        ...g,
                        status: 'failed',
                        content: errorContent,
                        error: {
                          message: errorContent,
                          code: err.code ?? 'ERR-001',
                        },
                      }
                    : g,
                ),
              }
            : m,
        ),
      )
    } finally {
      setIsStreaming(false)
    }
  }

  const sendPendingMessage = useEffectEvent((pending: PendingMessage) => {
    setModelId(pending.modelId)
    if (pending.modelIds && pending.modelIds.length >= 2) {
      setMode('compare')
      setCompareModelIds(pending.modelIds)
      void handleSendCompare(
        pending.content,
        pending.modelIds,
        pending.skillId,
        undefined,
        pending.enableWebSearch,
      )
      return
    }
    void handleSend(
      pending.content,
      pending.modelId,
      pending.skillId,
      undefined,
      pending.enableWebSearch,
    )
  })

  useEffect(() => {
    const pending = takePendingMessageForConversation(conversationId)
    if (pending) sendPendingMessage(pending)
  }, [conversationId])

  const handleStop = async () => {
    const streamingCompareMsg = messages.find(
      (m) =>
        m.streaming && m.compareGenerations && m.compareGenerations.length > 0,
    )
    if (streamingCompareMsg?.compareGenerations) {
      for (const g of streamingCompareMsg.compareGenerations) {
        if (g.status === 'streaming') {
          try {
            await stopGeneration({ data: { generationId: g.id } })
          } catch {}
        }
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingCompareMsg.id
            ? {
                ...m,
                streaming: false,
                compareGenerations: m.compareGenerations?.map((g) =>
                  g.status === 'streaming' ? { ...g, status: 'cancelled' } : g,
                ),
              }
            : m,
        ),
      )
    }

    if (generationId) {
      try {
        await stopGeneration({ data: { generationId } })
      } catch {}
    }

    setIsStreaming(false)
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    )
  }

  const handleStopPerModel = async (genId: string) => {
    try {
      await stopGeneration({ data: { generationId: genId } })
    } catch {}
    setMessages((prev) =>
      prev.map((m) =>
        m.compareGenerations
          ? {
              ...m,
              compareGenerations: m.compareGenerations.map((g) =>
                g.id === genId ? { ...g, status: 'cancelled' } : g,
              ),
            }
          : m,
      ),
    )
  }

  const handleRetry = async (genId: string) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.compareGenerations
          ? {
              ...m,
              compareGenerations: m.compareGenerations.map((g) =>
                g.id === genId ? { ...g, status: 'streaming', content: '' } : g,
              ),
            }
          : m,
      ),
    )
    try {
      const response = (await retryGeneration({
        data: { generationId: genId },
      })) as Response
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        setMessages((prev) =>
          prev.map((m) =>
            m.compareGenerations
              ? {
                  ...m,
                  compareGenerations: m.compareGenerations.map((g) =>
                    g.id === genId
                      ? { ...g, content: text, status: 'completed' }
                      : g,
                  ),
                }
              : m,
          ),
        )
        return
      }
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        full += decoder.decode(value, { stream: true })
        setMessages((prev) =>
          prev.map((m) =>
            m.compareGenerations
              ? {
                  ...m,
                  compareGenerations: m.compareGenerations.map((g) =>
                    g.id === genId ? { ...g, content: full } : g,
                  ),
                }
              : m,
          ),
        )
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.compareGenerations
            ? {
                ...m,
                compareGenerations: m.compareGenerations.map((g) =>
                  g.id === genId
                    ? { ...g, content: full, status: 'completed' }
                    : g,
                ),
              }
            : m,
        ),
      )
    } catch (e) {
      const err = e as Error
      const msg = err.message || 'Coba lagi gagal'
      setMessages((prev) =>
        prev.map((m) =>
          m.compareGenerations
            ? {
                ...m,
                compareGenerations: m.compareGenerations.map((g) =>
                  g.id === genId
                    ? {
                        ...g,
                        status: 'failed',
                        error: { message: msg, code: 'ERR-001' },
                        content: msg,
                      }
                    : g,
                ),
              }
            : m,
        ),
      )
    }
  }

  return (
    <WorkspaceShell
      credits={credits}
      activeConversationId={conversationId}
      onNewChat={() => {
        void navigate({ to: '/chat' })
      }}
      onSelectConversation={(id) => {
        void navigate({
          to: '/chat/$conversationId',
          params: { conversationId: id },
        })
      }}
    >
      <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {webSearchToast && (
          <div
            role="status"
            data-testid="web-search-toast"
            className="fixed right-6 top-6 z-50 rounded-md border border-hairline bg-pure-white px-4 py-3 text-[13px] text-ink shadow-sm"
          >
            Web search tidak tersedia. Melanjutkan tanpa hasil web.
          </div>
        )}
        <header className="flex h-12 shrink-0 items-center justify-between px-4 lg:px-6">
          {compareEnabled && compareModelIds.length >= 2 && (
            <span
              data-testid="topbar-compare-label"
              className="text-[14px] font-medium text-stone"
            >
              Mode banding · {compareModelIds.length} model
            </span>
          )}
          <span className="flex-1" />
        </header>

        <MessageList
          messages={messages}
          onRetryGeneration={handleRetry}
          onStopGeneration={handleStopPerModel}
        />

        <div className="pointer-events-none absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-pure-white via-pure-white/95 to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] px-4 lg:px-6">
          <div className="pointer-events-auto mx-auto max-w-[860px]">
            <Composer
              onSend={handleSend}
              onSendCompare={handleSendCompare}
              onStop={handleStop}
              isStreaming={isStreaming}
              credits={credits}
              modelValue={modelId}
              onModelChange={setModelId}
              compareEnabled={compareEnabled}
              onCompareEnabledChange={setCompareEnabled}
              compareModelIds={compareModelIds}
              onCompareModelIdsChange={setCompareModelIds}
              conversationId={conversationId}
              placement="inline"
            />
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
