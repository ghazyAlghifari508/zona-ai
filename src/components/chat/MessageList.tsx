import { Copy01Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { ProviderIcon } from '@/components/ui/ProviderIcons'
import { CitationDrawer, type CitationSource } from './CitationDrawer'
import { CodeBlock } from './CodeBlock'
import { InlineError } from './InlineError'
import { TypingDots } from './TypingDots'
import { findCatalogEntry, useModelCatalog } from './useModelCatalog'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string
  routerModelId?: string
  routingReason?: string
  streaming?: boolean
  webSources?: CitationSource[]
  errorCode?: string
  errorMessage?: string
  onRetry?: () => void
}

export function MessageList({
  messages,
  onRegenerate,
}: {
  messages: ChatMessage[]
  onRegenerate?: (messageId: string) => void
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const catalog = useModelCatalog()
  const shouldVirtualize = messages.length > 50
  const lastMessage = messages.at(-1)
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
    initialRect: { width: 800, height: 600 },
  })

  useEffect(() => {
    void lastMessage?.content
    const container = parentRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [lastMessage?.content])

  return (
    <div
      ref={parentRef}
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
      data-testid="message-list"
      className={`min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 ${shouldVirtualize ? '' : 'flex flex-col'}`}
    >
      {shouldVirtualize ? (
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const message = messages[virtualItem.index]
            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                data-index={virtualItem.index}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <MessageItem
                  message={message}
                  catalog={catalog}
                  onRegenerate={onRegenerate}
                />
              </div>
            )
          })}
        </div>
      ) : (
        messages.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            catalog={catalog}
            onRegenerate={onRegenerate}
          />
        ))
      )}
      {messages.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-20 text-center">
          <div className="space-y-2">
            <h2 className="text-[22px] font-bold tracking-[-0.242px] text-ink">
              Mulai percakapan
            </h2>
            <p className="text-[14px] text-stone">
              Tanyakan apa saja ke Zona.ai
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageItem({
  message,
  catalog,
  onRegenerate,
}: {
  message: ChatMessage
  catalog: ReturnType<typeof useModelCatalog>
  onRegenerate?: (messageId: string) => void
}) {
  const entry = findCatalogEntry(catalog, message.modelId)
  if (message.role === 'user') {
    return (
      <div className="flex justify-end py-4">
        <div className="max-w-[min(78%,680px)] rounded-xl bg-ink px-4 py-2.5 text-[15px] leading-[1.6] text-pure-white [overflow-wrap:anywhere]">
          {message.content}
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-[860px] py-6">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-pure-white text-ink">
            <ProviderIcon
              provider={entry?.provider ?? 'zona-router'}
              size={17}
            />
          </span>
          <span className="text-[13px] font-bold text-ink">
            {entry?.displayName ?? 'Model AI'}
          </span>
        </div>
        <div className="min-w-0 space-y-2 pl-9">
          <div className="prose prose-sm max-w-none text-[15px] leading-[1.7] text-ink [overflow-wrap:anywhere]">
            <ReactMarkdown
              rehypePlugins={[rehypeSanitize, rehypeHighlight]}
              components={{
                code: ({ children, className }) => {
                  const isBlock =
                    String(children).includes('\n') || Boolean(className)
                  if (isBlock) {
                    return <CodeBlock>{String(children)}</CodeBlock>
                  }
                  return (
                    <code className="rounded bg-paper px-1 py-0.5 text-[14px]">
                      {children}
                    </code>
                  )
                },
                pre: ({ children }) => <>{children}</>,
              }}
            >
              {message.content}
            </ReactMarkdown>
            {message.streaming && !message.content && <TypingDots />}
          </div>
          {message.errorMessage && (
            <InlineError
              code={message.errorCode}
              message={message.errorMessage}
              onRetry={message.onRetry}
            />
          )}
          {message.webSources && message.webSources.length > 0 && (
            <CitationDrawer sources={message.webSources} />
          )}
          {!message.streaming && message.content && (
            <div className="flex items-center gap-1 pt-1">
              <button
                type="button"
                aria-label="Salin"
                onClick={() =>
                  void navigator.clipboard.writeText(message.content)
                }
                className="flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[12px] text-stone transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
              >
                <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
                Salin
              </button>
              {onRegenerate && (
                <button
                  type="button"
                  aria-label="Jawab ulang"
                  onClick={() => onRegenerate(message.id)}
                  className="flex min-h-9 items-center gap-1.5 rounded-md px-2 text-[12px] text-stone transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
                >
                  <HugeiconsIcon
                    icon={Refresh01Icon}
                    size={14}
                    strokeWidth={1.75}
                  />
                  Jawab ulang
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
