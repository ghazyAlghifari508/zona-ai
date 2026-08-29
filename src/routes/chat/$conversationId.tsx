import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { CompareGrid } from '@/components/chat/CompareGrid'
import { CompareToggles } from '@/components/chat/CompareToggles'
import { Composer } from '@/components/chat/Composer'
import { type ChatMessage, MessageList } from '@/components/chat/MessageList'
import { MobileCompareTabs } from '@/components/chat/MobileCompareTabs'
import { WorkspaceShell } from '@/components/layout/WorkspaceShell'
import { parseStreamEvent } from '@/lib/ai/multiplex'
import { hydrateMessages } from '@/lib/utils/conversation-hydration'
import {
  regenerateMessage,
  retryGeneration,
  sendCompareMessage,
  sendMessage,
  stopGeneration,
} from '@/server/functions/chat'
import { getConversation } from '@/server/functions/conversations'
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
    const [conversation, persistedMessages] = await Promise.all([
      getConversation({ data: { id: params.conversationId } }),
      getMessages({ data: { conversationId: params.conversationId } }),
    ])
    return { conversation, persistedMessages }
  },
  errorComponent: ConversationError,
  component: ChatThread,
})

function ConversationError() {
  return (
    <WorkspaceShell>
      <div className="flex min-h-[60vh] items-center justify-center text-center">
        <div>
          <h1 className="text-[30px] font-medium text-ink-black">
            Percakapan tidak ditemukan
          </h1>
          <p className="mt-2 text-[15px] text-stone-gray">
            Percakapan ini tidak tersedia atau tidak dapat diakses.
          </p>
          <Link
            to="/chat"
            className="mt-5 inline-flex rounded-full border border-ink-black bg-pure-white px-4 py-2 text-[15px] font-medium text-ink-black hover:bg-sandstone"
          >
            Kembali ke chat
          </Link>
        </div>
      </div>
    </WorkspaceShell>
  )
}

type CompareGeneration = {
  id: string
  modelId: string
  status: string
  content: string
  reasoningContent?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  latencyMs?: number | null
  timeToFirstTokenMs?: number | null
  comparisonRunId?: string | null
  messageId?: string
  webSources?: Array<{
    url: string
    title: string | null
    snippet: string | null
    position: number
    score?: number | null
  }>
}

function ChatThread() {
  const { conversationId } = Route.useParams()
  const { conversation, persistedMessages } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    // cast boundary: loader data type mismatch with hydrateMessages expected shape
    const typed = persistedMessages as Parameters<typeof hydrateMessages>[0]
    return hydrateMessages(typed)
  })
  const [isStreaming, setIsStreaming] = useState(false)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const credits = 85

  const [mode, setMode] = useState<'normal' | 'compare'>(
    (conversation.mode as 'normal' | 'compare') ?? 'normal',
  )
  const [compareModelIds, setCompareModelIds] = useState<string[]>([])
  const [compareGenerations, setCompareGenerations] = useState<
    CompareGeneration[]
  >(() => {
    const allGens = (
      persistedMessages as Array<{ generationRuns: CompareGeneration[] }>
    ).flatMap((m) => m.generationRuns ?? [])
    const compareGens = allGens.filter((g) => g.comparisonRunId)
    if (compareGens.length === 0) return []
    // group by comparisonRunId, take latest group
    const byComp = new Map<string, CompareGeneration[]>()
    for (const g of compareGens) {
      if (!g.comparisonRunId) continue
      const key = g.comparisonRunId
      const arr = byComp.get(key) ?? []
      arr.push(g)
      byComp.set(key, arr)
    }
    const groups = Array.from(byComp.values())
    const latest = groups[groups.length - 1]
    // Map to expected shape, ensure content fallback
    return latest.map((g) => ({
      id: g.id,
      modelId: g.modelId,
      status: g.status,
      content: g.content ?? '',
      reasoningContent: g.reasoningContent,
      promptTokens: g.promptTokens,
      completionTokens: g.completionTokens,
      totalTokens: g.totalTokens,
      latencyMs: g.latencyMs,
      timeToFirstTokenMs: g.timeToFirstTokenMs,
      comparisonRunId: g.comparisonRunId,
      messageId: g.messageId,
      webSources: g.webSources,
    }))
  })
  const [userPrompt, setUserPrompt] = useState<string>(() => {
    // try to find last user message content
    const lastUser = [...persistedMessages]
      .reverse()
      .find((m) => m.role === 'user')
    return (lastUser as { content: string } | undefined)?.content ?? ''
  })
  const [compareIsStreaming, setCompareIsStreaming] = useState(false)

  // Keep mode sync if conversation mode changes externally? Not needed

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
    setUserPrompt(content)
    const initialGens: CompareGeneration[] = modelIds.map((mid) => ({
      id: crypto.randomUUID(),
      modelId: mid,
      status: 'streaming',
      content: '',
    }))
    // We will replace ids with real generationIds from server after response? But spec says generationId is server-generated; we use placeholder and then map via modelId? Better to trust server ids after demux
    // For optimistic, show placeholders, then when stream starts we will replace/insert real ids via generation-start events
    setCompareGenerations(initialGens.map((g) => ({ ...g, content: '' })))
    setCompareIsStreaming(true)
    setIsStreaming(true)
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
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        // fallback treat as plain
        setCompareGenerations((prev) =>
          prev.map((g) => ({ ...g, content: text, status: 'completed' })),
        )
        setCompareIsStreaming(false)
        setIsStreaming(false)
        return
      }
      const decoder = new TextDecoder()
      let buffer = ''
      // Map generationId -> modelId for demux
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
              // first time we see generationId, map to index via modelId
              if (event.type === 'generation-start') {
                // Find placeholder by modelId that hasn't yet been mapped
                const _idx = initialGens.findIndex(
                  (g) => g.modelId === event.modelId && !genIdToIndex.has(g.id),
                )
                // But we have real generationId from server; we need to map event.generationId to our placeholder's index
                // Find placeholder index by modelId
                const _placeholderIdx = compareGenerations.findIndex(
                  (_, i) => modelIds[i] === event.modelId,
                ) // not reliable after state updates
                // Instead, map generationId to modelId index
                const modelIdx = modelIds.indexOf(event.modelId)
                if (modelIdx !== -1) {
                  genIdToIndex.set(event.generationId, modelIdx)
                  // update generation id to real one
                  setCompareGenerations((prev) => {
                    const next = [...prev]
                    if (next[modelIdx])
                      next[modelIdx] = {
                        ...next[modelIdx],
                        id: event.generationId,
                      }
                    return next
                  })
                }
              } else if (event.type === 'text-delta') {
                const idx = genIdToIndex.get(event.generationId)
                if (idx !== undefined) {
                  setCompareGenerations((prev) => {
                    const next = [...prev]
                    const cur = next[idx]
                    if (cur)
                      next[idx] = {
                        ...cur,
                        content: (cur.content ?? '') + event.text,
                      }
                    return next
                  })
                } else {
                  // fallback by modelId
                  const modelIdx = modelIds.indexOf(event.modelId)
                  if (modelIdx !== -1) {
                    setCompareGenerations((prev) => {
                      const next = [...prev]
                      const cur = next[modelIdx]
                      if (cur)
                        next[modelIdx] = {
                          ...cur,
                          content: (cur.content ?? '') + event.text,
                        }
                      return next
                    })
                  }
                }
              } else if (event.type === 'generation-finish') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  setCompareGenerations((prev) => {
                    const next = [...prev]
                    if (next[idx])
                      next[idx] = { ...next[idx], status: 'completed' }
                    return next
                  })
                }
              } else if (event.type === 'generation-error') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  setCompareGenerations((prev) => {
                    const next = [...prev]
                    if (next[idx])
                      next[idx] = {
                        ...next[idx],
                        status: 'failed',
                        content: next[idx].content,
                      }
                    return next
                  })
                }
              } else if (event.type === 'usage') {
                const idx =
                  genIdToIndex.get(event.generationId) ??
                  modelIds.indexOf(event.modelId)
                if (idx !== -1) {
                  setCompareGenerations((prev) => {
                    const next = [...prev]
                    if (next[idx])
                      next[idx] = {
                        ...next[idx],
                        promptTokens: event.promptTokens,
                        completionTokens: event.completionTokens,
                        totalTokens: event.totalTokens,
                      }
                    return next
                  })
                }
              }
            } catch {}
          }
        }
      }
      // after done, mark any still streaming as completed (fallback)
      setCompareGenerations((prev) =>
        prev.map((g) =>
          g.status === 'streaming' ? { ...g, status: 'completed' } : g,
        ),
      )
    } catch (e) {
      const err = e as Error & { status?: number; code?: string }
      if (err.status === 402 || err.code === 'ERR-019') {
        setCompareGenerations((prev) =>
          prev.map((g) => ({
            ...g,
            status: 'failed',
            content: 'Kredit tidak mencukupi',
          })),
        )
      } else {
        setCompareGenerations((prev) =>
          prev.map((g) =>
            g.status === 'streaming'
              ? { ...g, status: 'failed', content: `Error: ${err.message}` }
              : g,
          ),
        )
      }
    } finally {
      setCompareIsStreaming(false)
      setIsStreaming(false)
    }
  }

  const handleStop = async () => {
    if (mode === 'compare') {
      // stop all compare generations
      for (const g of compareGenerations) {
        if (g.status === 'streaming') {
          try {
            await stopGeneration({ data: { generationId: g.id } })
          } catch {}
        }
      }
      setCompareGenerations((prev) =>
        prev.map((g) =>
          g.status === 'streaming' ? { ...g, status: 'cancelled' } : g,
        ),
      )
      setCompareIsStreaming(false)
      setIsStreaming(false)
    } else {
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
  }

  const handleStopPerModel = async (genId: string) => {
    try {
      await stopGeneration({ data: { generationId: genId } })
    } catch {}
    setCompareGenerations((prev) =>
      prev.map((g) => (g.id === genId ? { ...g, status: 'cancelled' } : g)),
    )
  }

  const handleRetry = async (genId: string) => {
    setCompareGenerations((prev) =>
      prev.map((g) =>
        g.id === genId ? { ...g, status: 'streaming', content: '' } : g,
      ),
    )
    try {
      const response = (await retryGeneration({
        data: { generationId: genId },
      })) as Response
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        setCompareGenerations((prev) =>
          prev.map((g) =>
            g.id === genId ? { ...g, content: text, status: 'completed' } : g,
          ),
        )
        return
      }
      const decoder = new TextDecoder()
      let full = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        full += chunk
        setCompareGenerations((prev) =>
          prev.map((g) => (g.id === genId ? { ...g, content: full } : g)),
        )
      }
      setCompareGenerations((prev) =>
        prev.map((g) =>
          g.id === genId ? { ...g, content: full, status: 'completed' } : g,
        ),
      )
    } catch (_e) {
      setCompareGenerations((prev) =>
        prev.map((g) => (g.id === genId ? { ...g, status: 'failed' } : g)),
      )
    }
  }

  const handleRegenerate = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId)
    if (!msg) return
    setIsStreaming(true)
    try {
      const response = (await regenerateMessage({
        data: { messageId },
      })) as Response
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: text,
          } satisfies ChatMessage,
        ])
        return
      }
      const decoder = new TextDecoder()
      let fullText = ''
      const newId = crypto.randomUUID()
      setMessages((prev) => [
        ...prev,
        {
          id: newId,
          role: 'assistant',
          content: '',
          streaming: true,
        } satisfies ChatMessage,
      ])
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        fullText += chunk
        setMessages((prev) =>
          prev.map((m) => (m.id === newId ? { ...m, content: fullText } : m)),
        )
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === newId ? { ...m, streaming: false } : m)),
      )
    } catch (e) {
      console.error(e)
    } finally {
      setIsStreaming(false)
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
      <div className="flex h-[calc(100vh-2rem)] flex-col">
        <header className="mb-4 flex items-center justify-between border-b border-hairline-mist px-1 pb-3">
          <h1 className="truncate text-[20px] font-medium text-ink-black">
            {conversation.title ?? 'New Chat'}
          </h1>
          <div className="flex items-center gap-2">
            <CompareToggles mode={mode} onChange={setMode} />
            <span className="rounded-[10px] border border-hairline-mist bg-pure-white px-2 py-1 text-[13px] text-stone-gray">
              {conversation.mode}
            </span>
          </div>
        </header>

        {mode === 'compare' ? (
          <>
            {compareGenerations.length > 0 ? (
              <>
                <CompareGrid
                  comparisonRun={null}
                  generations={compareGenerations}
                  onRetry={handleRetry}
                  onStop={handleStopPerModel}
                  userPrompt={userPrompt}
                />
                <MobileCompareTabs
                  generations={compareGenerations}
                  onRetry={handleRetry}
                  onStop={handleStopPerModel}
                />
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center py-10 text-center">
                <div>
                  <h2 className="text-[20px] font-medium text-ink-black">
                    Compare Mode
                  </h2>
                  <p className="mt-1 text-[15px] text-stone-gray">
                    Pilih 2-4 model dan kirim prompt yang sama.
                  </p>
                </div>
              </div>
            )}
            {/* Also show normal messages history below compare grid? For persistence we also show normal list hidden on mobile? */}
            <div className="hidden">
              <MessageList messages={messages} />
            </div>
          </>
        ) : (
          <>
            <MessageList messages={messages} />
            {messages.some((m) => m.role === 'assistant' && !m.streaming) && (
              <div className="mx-auto mb-2 flex gap-2">
                <button
                  type="button"
                  data-testid="regenerate-button"
                  onClick={() => {
                    const lastAssistant = [...messages]
                      .reverse()
                      .find((m) => m.role === 'assistant')
                    if (lastAssistant) handleRegenerate(lastAssistant.id)
                  }}
                  className="rounded-full border border-hairline-mist bg-pure-white px-4 py-1.5 text-xs text-ink-black hover:bg-sandstone"
                  disabled={isStreaming}
                >
                  Regenerate
                </button>
              </div>
            )}
          </>
        )}

        <Composer
          onSend={handleSend}
          onSendCompare={handleSendCompare}
          onStop={handleStop}
          isStreaming={isStreaming || compareIsStreaming}
          credits={credits}
          mode={mode}
          compareModelIds={compareModelIds}
          onCompareModelIdsChange={setCompareModelIds}
          conversationId={conversationId}
        />
      </div>
    </WorkspaceShell>
  )
}
