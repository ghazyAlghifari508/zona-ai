import { ReloadIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
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
import type { ArtifactPhase } from '@/lib/ai/artifact-stream'
import {
  getChecklistCopyText,
  resolveChecklistDisplay,
} from '@/lib/chat/checklist'
import { COMPARE_MAX_WIDTH_CLASS } from '@/lib/chat/compare-card-width'
import type { ArtifactKind } from '@/lib/chat/skills'
import {
  chatHighlightOptions,
  extractRawText,
} from '@/lib/chat/syntax-highlight'
import { getModelProviderName } from '@/lib/models/filter'
import { ArtifactProgress } from './ArtifactProgress'
import { CitationDrawer, type CitationSource } from './CitationDrawer'
import { CodeBlock } from './CodeBlock'
import { CompareGrid } from './CompareGrid'
import { CopyButton } from './CopyButton'
import { FileCard } from './FileCard'
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
  artifactStatus?: ArtifactPhase
  artifactSection?: string
  artifactKind?: ArtifactKind
  artifactAck?: string
  generationRunId?: string
  artifact?: {
    kind: ArtifactKind
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

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function scrollToBottom(container: HTMLDivElement) {
  const top = container.scrollHeight
  let smooth = false
  if (!prefersReducedMotion() && typeof container.scrollTo === 'function') {
    try {
      container.scrollTo({ top, behavior: 'smooth' })
      smooth = true
    } catch {
      smooth = false
    }
  }
  if (!smooth) container.scrollTop = top
}

export function MessageList({
  messages,
  onRetryGeneration,
  onStopGeneration,
  onRetryArtifact,
  scrollRef,
  hasUsedCompareMode,
}: {
  messages: ChatMessage[]
  onRetryGeneration?: (generationId: string) => void
  onStopGeneration?: (generationId: string) => void
  onRetryArtifact?: (generationId: string) => void
  scrollRef?: RefObject<HTMLDivElement | null>
  hasUsedCompareMode?: boolean
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const catalog = useModelCatalog()
  const shouldVirtualize = messages.length > 50
  const lastMessage = messages.at(-1)
  const [scrollMargin, setScrollMargin] = useState(0)

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
    scrollToBottom(container)
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
        className={`mx-auto w-full transition-[max-width,padding] duration-200 ${
          hasUsedCompareMode
            ? `${COMPARE_MAX_WIDTH_CLASS} px-3 sm:px-4 lg:px-5`
            : 'max-w-[860px] px-4 lg:px-6'
        } pt-2 ${scrollRef ? 'pb-36' : 'pb-6'}`}
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
                    onRetryArtifact={onRetryArtifact}
                    hasUsedCompareMode={hasUsedCompareMode}
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
                onRetryArtifact={onRetryArtifact}
                hasUsedCompareMode={hasUsedCompareMode}
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

function MessageItem({
  message,
  catalog,
  onRetryGeneration,
  onStopGeneration,
  onRetryArtifact,
  hasUsedCompareMode,
}: {
  message: ChatMessage
  catalog: ReturnType<typeof useModelCatalog>
  onRetryGeneration?: (generationId: string) => void
  onStopGeneration?: (generationId: string) => void
  onRetryArtifact?: (generationId: string) => void
  hasUsedCompareMode?: boolean
}) {
  const entry = findCatalogEntry(catalog, message.modelId)
  if (message.role === 'user') {
    return (
      <div className="flex w-full justify-end py-3">
        <div className="max-w-[min(78%,680px)] rounded-[20px] rounded-br-[4px] bg-accent px-4 py-2.5 text-[15px] font-normal leading-[1.5] text-white shadow-sm shadow-black/10 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.compareGenerations && message.compareGenerations.length > 0) {
    return (
      <div className="mx-auto w-full py-5">
        <CompareGrid
          comparisonRun={null}
          generations={message.compareGenerations}
          onRetry={onRetryGeneration}
          onStop={onStopGeneration}
        />
      </div>
    )
  }

  if (
    hasUsedCompareMode &&
    !message.artifact &&
    !message.artifactStatus &&
    message.role === 'assistant'
  ) {
    const singleGen = {
      id: message.generationRunId ?? message.id,
      modelId: message.modelId ?? 'auto',
      status: message.streaming
        ? 'streaming'
        : message.errorCode
          ? 'failed'
          : 'completed',
      content: message.content,
      error: message.errorMessage
        ? { message: message.errorMessage, code: message.errorCode }
        : undefined,
      webSources: message.webSources,
    }

    return (
      <div className="mx-auto w-full py-5">
        <CompareGrid
          comparisonRun={null}
          generations={[singleGen]}
          onRetry={onRetryGeneration}
          onStop={onStopGeneration}
        />
      </div>
    )
  }

  const providerName = getModelProviderName(entry, message.modelId)
  const hasVisibleContent = Boolean(
    message.content && message.content.trim().length > 0,
  )
  const isWaiting =
    Boolean(message.streaming) && !hasVisibleContent && !message.artifactStatus

  return (
    <div className="w-full py-5">
      <div className="min-w-0">
        <div className="mb-2 flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-pure-white text-ink">
            <ProviderIcon
              provider={entry?.provider ?? 'zona-router'}
              size={17}
            />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="text-[13px] font-bold leading-tight text-ink">
              {entry?.displayName ?? 'Model AI'}
            </span>
            <span className="text-[11px] font-medium leading-tight text-stone">
              {providerName}
            </span>
          </div>
        </div>
        <div className="min-w-0 space-y-2 pl-9">
          {isWaiting && <TypingDots />}
          {message.artifactStatus && message.artifactStatus !== 'completed' && (
            <>
              <ArtifactProgress
                kind={message.artifactKind ?? message.artifact?.kind ?? 'prd'}
                phase={message.artifactStatus}
                section={message.artifactSection}
                errorMessage={message.errorMessage}
                ack={message.artifactAck}
              />
              {message.artifactStatus === 'error' &&
                message.generationRunId &&
                onRetryArtifact && (
                  <div className="pl-9">
                    <button
                      type="button"
                      data-testid="artifact-retry-btn"
                      onClick={() => {
                        const genId = message.generationRunId
                        if (genId) onRetryArtifact(genId)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink transition-all duration-150 hover:bg-ink/5 active:scale-95"
                    >
                      <HugeiconsIcon
                        icon={ReloadIcon}
                        size={14}
                        strokeWidth={1.75}
                        aria-hidden="true"
                      />
                      Coba lagi
                    </button>
                  </div>
                )}
            </>
          )}
          {hasVisibleContent &&
            (!message.artifactStatus ||
              message.artifactStatus === 'completed') && (
              <ChecklistAwareContent
                content={message.content}
                isStreaming={Boolean(message.streaming)}
                storageKey={`msg:${message.id}`}
                renderMarkdown={(text) => (
                  <div className="chat-prose max-w-none text-[15px] leading-[1.7] text-ink [overflow-wrap:anywhere]">
                    <ReactMarkdown
                      rehypePlugins={[
                        rehypeSanitize,
                        [rehypeHighlight, chatHighlightOptions],
                      ]}
                      components={{
                        code: ({ children, className }) => {
                          const isBlock =
                            Boolean(className) ||
                            extractRawText(children).includes('\n')
                          if (isBlock) {
                            return (
                              <CodeBlock className={className}>
                                {children}
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
                  </div>
                )}
              />
            )}
          {message.artifact && <FileCard artifact={message.artifact} />}
          {message.errorMessage && !message.artifactStatus && (
            <InlineError
              code={message.errorCode}
              message={message.errorMessage}
              onRetry={
                message.artifactKind && message.generationRunId
                  ? onRetryArtifact
                    ? () => {
                        const genId = message.generationRunId
                        if (genId) onRetryArtifact(genId)
                      }
                    : undefined
                  : message.onRetry
              }
            />
          )}
          {message.webSources && message.webSources.length > 0 && (
            <CitationDrawer sources={message.webSources} />
          )}
          {!message.streaming && message.content && !message.artifact && (
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
