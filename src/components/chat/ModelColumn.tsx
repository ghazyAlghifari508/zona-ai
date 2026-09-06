import { ReloadIcon, StopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { ProviderIcon } from '@/components/ui/ProviderIcons'
import {
  getChecklistCopyText,
  resolveChecklistDisplay,
} from '@/lib/chat/checklist'
import { shouldExpandCompareCard } from '@/lib/chat/compare-card-width'
import {
  chatHighlightOptions,
  extractRawText,
} from '@/lib/chat/syntax-highlight'
import { getModelProviderName } from '@/lib/models/filter'
import { humanizeGenerationError } from '@/lib/utils/error-display'
import { ChecklistAwareContent } from './ChecklistAwareContent'
import { CitationDrawer, type CitationSource } from './CitationDrawer'
import { CodeBlock } from './CodeBlock'
import { CopyButton } from './CopyButton'
import { InlineError } from './InlineError'
import { ReasoningSection } from './ReasoningSection'
import { TypingDots } from './TypingDots'
import { findCatalogEntry, useModelCatalog } from './useModelCatalog'

type Generation = {
  id: string
  modelId: string
  status: string
  content?: string | null
  reasoningContent?: string | null
  promptTokens?: number | null
  completionTokens?: number | null
  totalTokens?: number | null
  latencyMs?: number | null
  timeToFirstTokenMs?: number | null
  error?: unknown
  webSources?: CitationSource[]
}

type Props = {
  generation: Generation
  onRetry?: (generationId: string) => void
  onStop?: (generationId: string) => void
  onCopy?: (content: string) => void
}

export function ModelColumn({ generation, onRetry, onStop, onCopy }: Props) {
  const catalog = useModelCatalog()
  const entry = findCatalogEntry(catalog, generation.modelId)
  const providerName = getModelProviderName(entry, generation.modelId)

  const getCopyText = () => {
    if (!generation.content) return ''
    const display = resolveChecklistDisplay(generation.content, false)
    return display?.status === 'ready'
      ? getChecklistCopyText(display.checklist)
      : generation.content
  }

  const hasVisibleContent = Boolean(
    generation.content && generation.content.trim().length > 0,
  )
  const isWaiting =
    (generation.status === 'streaming' || generation.status === 'queued') &&
    !hasVisibleContent

  const isFailedOrEmptyCompleted =
    generation.status === 'failed' ||
    (generation.status === 'completed' && !hasVisibleContent)

  const errorToHumanize =
    generation.error ??
    (isFailedOrEmptyCompleted
      ? 'Model tidak menghasilkan jawaban akhir. Coba lagi.'
      : null)

  const displayError = humanizeGenerationError(errorToHumanize)
  const contentAsError =
    displayError.technicalDetail === null && generation.content?.trim()
      ? humanizeGenerationError(generation.content)
      : null
  const userMessage = contentAsError?.userMessage ?? displayError.userMessage
  const technicalDetail =
    displayError.technicalDetail ?? contentAsError?.technicalDetail ?? null

  const contentToAnalyze = generation.content ?? ''
  const shouldExpand = shouldExpandCompareCard(contentToAnalyze)
  const [hasExpanded, setHasExpanded] = useState(() => shouldExpand)

  // One-way latch during streaming: once expanded, stays expanded for this generation
  useEffect(() => {
    if (shouldExpand && !hasExpanded) {
      setHasExpanded(true)
    }
  }, [shouldExpand, hasExpanded])

  // Reset latch when generation ID changes
  const prevIdRef = useRef(generation.id)
  if (prevIdRef.current !== generation.id) {
    prevIdRef.current = generation.id
    setHasExpanded(shouldExpandCompareCard(generation.content ?? ''))
  }

  const isExpanded = hasExpanded || shouldExpand

  return (
    <div
      data-testid="model-column"
      data-width-variant={isExpanded ? 'expanded' : 'compact'}
      className="flex h-full min-h-[260px] sm:min-h-[280px] max-h-[640px] sm:max-h-[680px] min-w-0 max-w-full w-full flex-col overflow-hidden rounded-lg border border-hairline bg-pure-white transition-[width,max-width] duration-200"
    >
      <div
        data-testid="model-column-header"
        className="flex shrink-0 items-center justify-between rounded-t-lg border-b border-hairline bg-pure-white p-3"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-hairline bg-pure-white text-ink">
            <ProviderIcon
              provider={entry?.provider ?? 'zona-router'}
              size={14}
            />
          </span>
          <div className="flex flex-col min-w-0">
            <span className="truncate text-[13.5px] font-semibold leading-tight text-ink">
              {entry?.displayName ?? generation.modelId}
            </span>
            <span className="truncate text-[11px] font-medium leading-tight text-stone">
              {providerName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {generation.status === 'streaming' && onStop && (
            <button
              type="button"
              data-testid={`stop-${generation.id}`}
              onClick={() => onStop(generation.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone hover:bg-ink/5 hover:text-ink"
              aria-label="Stop"
            >
              <HugeiconsIcon
                icon={StopIcon}
                size={14}
                strokeWidth={1.75}
                fill="currentColor"
              />
            </button>
          )}
          {generation.status === 'completed' && generation.content && (
            <CopyButton
              content={getCopyText()}
              onCopied={onCopy}
              testId={`copy-${generation.id}`}
              className="h-7 w-7 min-h-0 justify-center rounded-md p-0 text-stone"
            />
          )}
        </div>
      </div>

      <div
        data-testid="model-column-content"
        className="zona-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4"
      >
        {generation.reasoningContent && (
          <ReasoningSection content={generation.reasoningContent} />
        )}
        {isFailedOrEmptyCompleted ? (
          <div className="flex min-w-0 flex-col items-center justify-center gap-3 py-8 text-center">
            <InlineError
              code={
                typeof generation.error === 'object' &&
                generation.error !== null &&
                'code' in generation.error &&
                typeof (generation.error as { code?: unknown }).code ===
                  'string'
                  ? (generation.error as { code: string }).code
                  : 'ERR-001'
              }
              message={userMessage}
              technicalDetail={technicalDetail}
            />
            {onRetry && (
              <button
                type="button"
                data-testid={`retry-${generation.id}`}
                onClick={() => onRetry(generation.id)}
                className="inline-flex items-center gap-1 rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-sm text-ink hover:bg-ink/5"
              >
                <HugeiconsIcon
                  icon={ReloadIcon}
                  size={14}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />{' '}
                Coba lagi
              </button>
            )}
          </div>
        ) : (
          <>
            <ChecklistAwareContent
              content={generation.content ?? ''}
              isStreaming={generation.status === 'streaming'}
              storageKey={`gen:${generation.id}`}
              renderMarkdown={(text) => (
                <div className="chat-prose max-w-none min-w-0 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-ink">
                  {text ? (
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
                          if (isBlock)
                            return (
                              <CodeBlock className={className}>
                                {children}
                              </CodeBlock>
                            )
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
                  ) : null}
                  {isWaiting && <TypingDots />}
                </div>
              )}
            />
            {generation.webSources && generation.webSources.length > 0 && (
              <CitationDrawer sources={generation.webSources} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
