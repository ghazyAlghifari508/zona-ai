import { createFileRoute, Link, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { Composer } from '@/components/chat/Composer'
import { type ChatMessage, MessageList } from '@/components/chat/MessageList'
import { WorkspaceShell } from '@/components/layout/WorkspaceShell'
import { hydrateMessages } from '@/lib/utils/conversation-hydration'
import {
  regenerateMessage,
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

function ChatThread() {
  const { conversationId } = Route.useParams()
  const { conversation, persistedMessages } = Route.useLoaderData()
  const navigate = Route.useNavigate()
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    hydrateMessages(persistedMessages),
  )
  const [isStreaming, setIsStreaming] = useState(false)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const credits = 85

  const handleSend = async (
    content: string,
    modelId: string,
    skillId: string,
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
        data: { conversationId, modelId, skillId, content },
      })) as unknown as Response

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
        // Fallback: if no body, try text
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
        // Try to parse as SSE or plain text
        // AI SDK UIMessage stream is SSE with data: prefix, but fallback to plain
        let delta = chunk
        // If chunk contains SSE data: lines, extract content
        if (chunk.includes('data:')) {
          const lines = chunk.split('\n')
          for (const line of lines) {
            if (line.startsWith('data:')) {
              const data = line.slice(5).trim()
              if (data === '[DONE]') continue
              try {
                const parsed = JSON.parse(data)
                // UIMessage chunk may have text delta in different shape
                if (parsed.type === 'text-delta' && parsed.delta)
                  delta = parsed.delta
                else if (parsed.textDelta) delta = parsed.textDelta
                else if (typeof parsed === 'string') delta = parsed
                else continue
              } catch {
                // not json, treat as raw
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

  const handleStop = async () => {
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

  const handleRegenerate = async (messageId: string) => {
    const msg = messages.find((m) => m.id === messageId)
    if (!msg) return
    setIsStreaming(true)
    try {
      const response = (await regenerateMessage({
        data: { messageId },
      })) as unknown as Response
      const reader = response.body?.getReader()
      if (!reader) {
        const text = await response.text()
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: text,
          } as ChatMessage,
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
        } as ChatMessage,
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
          <span className="rounded-[10px] border border-hairline-mist bg-pure-white px-2 py-1 text-[13px] text-stone-gray">
            {conversation.mode}
          </span>
        </header>
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
        <Composer
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={isStreaming}
          credits={credits}
        />
      </div>
    </WorkspaceShell>
  )
}
