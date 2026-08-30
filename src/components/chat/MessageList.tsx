import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
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

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
  const catalog = useModelCatalog()
  const shouldVirtualize = messages.length > 50
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
    initialRect: { width: 800, height: 600 },
  })

  return (
    <div
      ref={parentRef}
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
      data-testid="message-list"
      className={`min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 ${shouldVirtualize ? '' : 'flex flex-col'}`}
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
                <MessageItem message={message} catalog={catalog} />
              </div>
            )
          })}
        </div>
      ) : (
        messages.map((message) => (
          <MessageItem key={message.id} message={message} catalog={catalog} />
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
}: {
  message: ChatMessage
  catalog: ReturnType<typeof useModelCatalog>
}) {
  const entry = findCatalogEntry(catalog, message.modelId)
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)] gap-3.5 py-5">
      <div
        className={
          message.role === 'user'
            ? 'flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-coral bg-pure-white text-[11px] font-extrabold text-ink'
            : 'flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-notion-blue bg-pure-white text-[11px] font-extrabold tracking-[-0.04em] text-notion-blue'
        }
      >
        {message.role === 'user' ? 'K' : 'ZA'}
      </div>
      <div className="min-w-0 pt-0.5">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="text-[13px] font-bold text-ink">
            {message.role === 'user'
              ? 'Kamu'
              : (entry?.displayName ?? 'Zona.ai')}
          </span>
          {message.role !== 'user' &&
            message.routerModelId &&
            message.routingReason && (
              <span
                data-testid="routed-badge"
                className="rounded-full bg-sky-tint px-2 py-0.5 text-[10px] font-bold text-notion-blue"
              >
                Routed to {message.routerModelId}
              </span>
            )}
        </div>
        {message.role === 'user' ? (
          <div className="text-[15px] leading-[1.7] text-ink [overflow-wrap:anywhere]">
            {message.content}
          </div>
        ) : (
          <div className="min-w-0 space-y-2">
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
          </div>
        )}
      </div>
    </div>
  )
}
