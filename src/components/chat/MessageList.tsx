import { useVirtualizer } from '@tanstack/react-virtual'
import { Bot } from 'lucide-react'
import { useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { CitationDrawer, type CitationSource } from './CitationDrawer'
import { CodeBlock } from './CodeBlock'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string
  routerModelId?: string
  routingReason?: string
  streaming?: boolean
  webSources?: CitationSource[]
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  const parentRef = useRef<HTMLDivElement>(null)
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
      data-testid="message-list"
      className={`flex-1 overflow-y-auto p-4 ${shouldVirtualize ? '' : 'flex flex-col gap-6'}`}
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
                className="pb-6"
              >
                <MessageItem message={message} />
              </div>
            )
          })}
        </div>
      ) : (
        messages.map((message) => (
          <MessageItem key={message.id} message={message} />
        ))
      )}
      {messages.length === 0 && (
        <div className="flex flex-1 items-center justify-center py-20 text-center">
          <div className="space-y-2">
            <h2 className="text-[30px] font-medium text-ink-black">
              Mulai percakapan
            </h2>
            <p className="text-[15px] text-stone-gray">
              Tanyakan apa saja ke Zona.ai
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function MessageItem({ message }: { message: ChatMessage }) {
  return (
    <div
      className={`flex w-full ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      {message.role === 'user' ? (
        <div className="max-w-[70%] rounded-[10px] bg-sandstone px-3 py-2 text-[18px] leading-relaxed text-ink-black">
          {message.content}
        </div>
      ) : (
        <div className="flex max-w-[80%] gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-hairline-mist bg-pure-white">
            <Bot size={16} strokeWidth={1.75} className="text-ink-black" />
          </div>
          <div className="flex-1 space-y-2">
            {(message.modelId || message.routerModelId) && (
              <div className="flex items-center gap-2 text-xs text-stone-gray">
                {message.modelId && (
                  <span className="font-medium">{message.modelId}</span>
                )}
                {message.routingReason && message.routerModelId && (
                  <span data-testid="routed-badge">
                    Routed to {message.routerModelId}
                  </span>
                )}
              </div>
            )}
            <div className="prose prose-sm max-w-none text-[15px] leading-relaxed text-ink-black">
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
                      <code className="rounded bg-sandstone px-1 py-0.5 text-[14px]">
                        {children}
                      </code>
                    )
                  },
                  pre: ({ children }) => <>{children}</>,
                }}
              >
                {message.content}
              </ReactMarkdown>
              {message.streaming && (
                <span className="ml-1 inline-block animate-pulse">▌</span>
              )}
            </div>
            {message.webSources && message.webSources.length > 0 && (
              <CitationDrawer sources={message.webSources} />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
