import { useVirtualizer } from '@tanstack/react-virtual'
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { ChecklistAwareContent } from '@/components/chat/ChecklistAwareContent'
import { ProviderIcon } from '@/components/ui/ProviderIcons'
import type { PrdPhase, PrdSection } from '@/lib/ai/prd-stream'
import {
  getChecklistCopyText,
  resolveChecklistDisplay,
} from '@/lib/chat/checklist'
import { CitationDrawer, type CitationSource } from './CitationDrawer'
import { CodeBlock } from './CodeBlock'
import { CompareGrid } from './CompareGrid'
import { CopyButton } from './CopyButton'
import { FileCard } from './FileCard'
import { InlineError } from './InlineError'
import { PrdProgress } from './PrdProgress'
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
  prdStatus?: PrdPhase
  prdSection?: PrdSection
  prdArtifact?: {
    attachmentId: string
    fileName: string
    fileSize: number
    mimeType: string
  }
  compareGenerations?: Array<{
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
    error?: { message?: string; code?: string } | unknown
    webSources?: Array<{
      url: string
      title: string | null
      snippet: string | null
      position: number
      score?: number | null
    }>
  }>
}

function getCopyTextForMessage(content: string): string {
  const display = resolveChecklistDisplay(content, false)
  return display?.status === 'ready'
    ? getChecklistCopyText(display.checklist)
    : content
}

export function MessageList({
  messages,
  onRetryGeneration,
  onStopGeneration,
  scrollRef,
  compareEnabled,
}: {
  messages: ChatMessage[]
  onRetryGeneration?: (generationId: string) => void
  onStopGeneration?: (generationId: string) => void
  scrollRef?: RefObject<HTMLDivElement | null>
  compareEnabled?: boolean
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const catalog = useModelCatalog()
  const shouldVirtualize = messages.length > 50
  const lastMessage = messages.at(-1)
  const [scrollMargin, setScrollMargin] = useState(0)

  const isCompare = Boolean(
    compareEnabled ||
      messages.some(
        (m) => m.compareGenerations && m.compareGenerations.length > 0,
      ),
  )

  useLayoutEffect(() => {
    if (!scrollRef) return
    const scrollEl = scrollRef.current
    const listEl = parentRef.current
    if (!scrollEl || !listEl) return
    const top =
      listEl.getBoundingClientRect().top -
      scrollEl.getBoundingClientRect().top +
      scrollEl.scrollTop
    setScrollMargin(top)
  }, [scrollRef])

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef?.current ?? parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
    initialRect: { width: 800, height: 600 },
    scrollMargin,
  })

  useEffect(() => {
    void lastMessage?.content
    const container = scrollRef?.current ?? parentRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
  }, [lastMessage?.content, scrollRef])

  return (
    <div
      ref={parentRef}
      role="log"
      aria-live="polite"
      aria-label="Chat messages"
      data-testid="message-list"
      data-message-count={messages.length}
      className={
        scrollRef
          ? 'min-h-0 min-w-0 flex-1 w-full'
          : 'zona-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto w-full'
      }
    >
      <div
        className={`mx-auto w-full px-4 pt-2 lg:px-6 ${
          scrollRef ? 'pb-36' : 'pb-6'
        } ${isCompare ? 'max-w-[1400px]' : 'max-w-[860px]'}`}
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
                    onRetryGeneration={onRetryGeneration}
                    onStopGeneration={onStopGeneration}
                  />
                </div>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col">
            {messages.map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                catalog={catalog}
                onRetryGeneration={onRetryGeneration}
                onStopGeneration={onStopGeneration}
              />
            ))}
          </div>
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
    </div>
  )
}

function flattenReactNodes(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(flattenReactNodes).join('')
  if (typeof node === 'object' && 'props' in node) {
    return flattenReactNodes(
      (node as { props: { children: ReactNode } }).props.children,
    )
  }
  return ''
}

function MessageItem({
  message,
  catalog,
  onRetryGeneration,
  onStopGeneration,
}: {
  message: ChatMessage
  catalog: ReturnType<typeof useModelCatalog>
  onRetryGeneration?: (generationId: string) => void
  onStopGeneration?: (generationId: string) => void
}) {
  const entry = findCatalogEntry(catalog, message.modelId)
  if (message.role === 'user') {
    return (
      <div className="flex justify-end py-3">
        <div className="max-w-[min(78%,680px)] rounded-[20px] rounded-br-[4px] bg-notion-blue px-4 py-2.5 text-[15px] font-normal leading-[1.5] text-pure-white shadow-sm shadow-notion-blue/20 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.compareGenerations && message.compareGenerations.length > 0) {
    return (
      <div className="w-full py-5">
        <CompareGrid
          comparisonRun={null}
          generations={message.compareGenerations}
          onRetry={onRetryGeneration}
          onStop={onStopGeneration}
        />
      </div>
    )
  }

  return (
    <div className="w-full py-5">
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
          {message.prdStatus && message.prdStatus !== 'completed' && (
            <PrdProgress
              phase={message.prdStatus}
              section={message.prdSection}
              errorMessage={message.errorMessage}
            />
          )}
          {message.content &&
            (!message.prdStatus || message.prdStatus === 'completed') && (
              <ChecklistAwareContent
                content={message.content}
                isStreaming={Boolean(message.streaming)}
                storageKey={`msg:${message.id}`}
                renderMarkdown={(text) => (
                  <div className="chat-prose max-w-none text-[15px] leading-[1.7] text-ink [overflow-wrap:anywhere]">
                    <ReactMarkdown
                      rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                      components={{
                        code: ({ children, className }) => {
                          const isBlock = Boolean(className)
                          if (isBlock) {
                            return (
                              <CodeBlock>
                                {flattenReactNodes(children)}
                              </CodeBlock>
                            )
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
                      {text}
                    </ReactMarkdown>
                    {message.streaming && !message.content && <TypingDots />}
                  </div>
                )}
              />
            )}
          {message.prdArtifact && <FileCard artifact={message.prdArtifact} />}
          {message.errorMessage && !message.prdStatus && (
            <InlineError
              code={message.errorCode}
              message={message.errorMessage}
              onRetry={message.onRetry}
            />
          )}
          {message.webSources && message.webSources.length > 0 && (
            <CitationDrawer sources={message.webSources} />
          )}
          {!message.streaming && message.content && !message.prdArtifact && (
            <div className="flex items-center gap-1 pt-1">
              <CopyButton
                content={getCopyTextForMessage(message.content)}
                label
                testId={`copy-${message.id}`}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
