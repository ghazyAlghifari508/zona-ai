import { Bot } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { CodeBlock } from './CodeBlock'

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelId?: string
  routerModelId?: string
  routingReason?: string
  streaming?: boolean
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div
      role="log"
      aria-live="polite"
      data-testid="message-list"
      className="flex flex-1 flex-col gap-6 overflow-y-auto p-4"
    >
      {messages.map((m) => (
        <div
          key={m.id}
          className={`flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {m.role === 'user' ? (
            <div className="max-w-[70%] rounded-[10px] bg-sandstone px-3 py-2 text-[18px] leading-relaxed text-ink-black">
              {m.content}
            </div>
          ) : (
            <div className="flex max-w-[80%] gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pure-white border border-hairline-mist">
                <Bot size={16} strokeWidth={1.75} className="text-ink-black" />
              </div>
              <div className="flex-1 space-y-2">
                {(m.modelId || m.routerModelId) && (
                  <div className="flex items-center gap-2 text-xs text-stone-gray">
                    {m.modelId && (
                      <span className="font-medium">{m.modelId}</span>
                    )}
                    {m.routingReason && m.routerModelId && (
                      <span data-testid="routed-badge">
                        Routed to {m.routerModelId}
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
                    {m.content}
                  </ReactMarkdown>
                  {m.streaming && (
                    <span className="ml-1 inline-block animate-pulse">▌</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
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
