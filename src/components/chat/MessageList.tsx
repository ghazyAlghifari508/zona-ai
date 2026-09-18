import { ReloadIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  memo,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { ChecklistAwareContent } from '@/components/chat/ChecklistAwareContent'
import { ProviderIcon } from '@/components/ui/ProviderIcons'
import type { ArtifactPhase } from '@/lib/ai/artifact-stream'
import type { ArtifactDescriptor } from '@/lib/artifacts/contracts'
import type { SafeArtifactMention } from '@/lib/artifacts/mentions'
import {
  getChecklistCopyText,
  resolveChecklistDisplay,
} from '@/lib/chat/checklist'
import {
  COMPARE_GUTTER_CLASS,
  COMPARE_MAX_WIDTH_CLASS,
} from '@/lib/chat/compare-card-width'
import type { ArtifactKind } from '@/lib/chat/skills'
import { getModelProviderName } from '@/lib/models/filter'
import { ArtifactMentionTokens } from '../artifacts/ArtifactMentionTokens'
import { ArtifactProgress } from './ArtifactProgress'
import { CitationDrawer, type CitationSource } from './CitationDrawer'
import { CompareGrid } from './CompareGrid'
import { CopyButton } from './CopyButton'
import { FileCard } from './FileCard'
import { InlineError } from './InlineError'
import { MarkdownContent } from './MarkdownContent'
import { TypingDots } from './TypingDots'
import { findCatalogEntry, useModelCatalog } from './useModelCatalog'

export type ChatMessageArtifact =
  | ArtifactDescriptor
  | {
      kind: ArtifactKind
      attachmentId: string
      fileName: string
      fileSize: number
      mimeType: string
    }

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  artifactMentions?: SafeArtifactMention[]
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
  artifact?: ChatMessageArtifact
  compareGenerations?: Array<{
    id: string
    serverGenerationId?: string
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
    artifact?: ArtifactDescriptor
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

function isNearBottom(container: HTMLDivElement, threshold = 120) {
  return (
    container.scrollHeight - container.scrollTop - container.clientHeight <=
    threshold
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
  onOpenArtifact,
  onOpenArtifacts,
  scrollRef,
  hasUsedCompareMode,
}: {
  messages: ChatMessage[]
  onRetryGeneration?: (generationId: string) => void
  onStopGeneration?: (generationId: string) => void
  onRetryArtifact?: (generationId: string) => void
  onOpenArtifact?: (
    artifact: ArtifactDescriptor | { artifactId: string; versionId: string },
  ) => void
  onOpenArtifacts?: (artifacts: ArtifactDescriptor[]) => void
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

  const messageCount = messages.length
  useEffect(() => {
    void messageCount
    const container = scrollRef?.current ?? parentRef.current
    if (!container) return
    scrollToBottom(container)
  }, [messageCount, scrollRef])

  useEffect(() => {
    void lastMessage?.content
    const container = scrollRef?.current ?? parentRef.current
    if (!container) return
    if (isNearBottom(container)) {
      scrollToBottom(container)
    }
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
            ? `${COMPARE_MAX_WIDTH_CLASS} ${COMPARE_GUTTER_CLASS}`
            : 'max-w-[860px] px-4 lg:px-6'
        } pt-2 ${scrollRef ? (hasUsedCompareMode ? 'pb-52' : 'pb-44') : 'pb-6'}`}
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
                    onOpenArtifact={onOpenArtifact}
                    onOpenArtifacts={onOpenArtifacts}
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
                onOpenArtifact={onOpenArtifact}
                onOpenArtifacts={onOpenArtifacts}
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

const MessageItem = memo(function MessageItem({
  message,
  catalog,
  onRetryGeneration,
  onStopGeneration,
  onRetryArtifact,
  onOpenArtifact,
  onOpenArtifacts,
  hasUsedCompareMode,
}: {
  message: ChatMessage
  catalog: ReturnType<typeof useModelCatalog>
  onRetryGeneration?: (generationId: string) => void
  onStopGeneration?: (generationId: string) => void
  onRetryArtifact?: (generationId: string) => void
  onOpenArtifact?: (
    artifact: ArtifactDescriptor | { artifactId: string; versionId: string },
  ) => void
  onOpenArtifacts?: (artifacts: ArtifactDescriptor[]) => void
  hasUsedCompareMode?: boolean
}) {
  const entry = findCatalogEntry(catalog, message.modelId)
  if (message.role === 'user') {
    return (
      <div className="message-row-contain flex w-full flex-col items-end py-3">
        {message.artifactMentions && message.artifactMentions.length > 0 && (
          <div className="mb-1 flex justify-end">
            <ArtifactMentionTokens
              mentions={message.artifactMentions}
              onOpenArtifact={onOpenArtifact}
            />
          </div>
        )}
        <div className="max-w-[min(78%,680px)] rounded-[20px] rounded-br-[4px] bg-accent px-4 py-2.5 text-[15px] font-normal leading-[1.5] text-white shadow-sm shadow-black/10 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.content}
        </div>
      </div>
    )
  }

  if (message.compareGenerations && message.compareGenerations.length > 0) {
    return (
      <div className="message-row-contain mx-auto w-full py-5">
        <CompareGrid
          comparisonRun={null}
          generations={message.compareGenerations}
          onRetry={onRetryGeneration}
          onStop={onStopGeneration}
          onOpenArtifact={onOpenArtifact}
          onOpenArtifacts={onOpenArtifacts}
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
      <div className="message-row-contain mx-auto w-full py-5">
        <CompareGrid
          comparisonRun={null}
          generations={[singleGen]}
          onRetry={onRetryGeneration}
          onStop={onStopGeneration}
          onOpenArtifact={onOpenArtifact}
          onOpenArtifacts={onOpenArtifacts}
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
    <div className="message-row-contain w-full py-5">
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
              {message.artifactStatus === 'failed' &&
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
                renderMarkdown={(text) => <MarkdownContent text={text} />}
              />
            )}
          {message.artifact && (
            <FileCard
              artifact={message.artifact}
              onOpen={
                'artifactId' in message.artifact ? onOpenArtifact : undefined
              }
            />
          )}
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
})
