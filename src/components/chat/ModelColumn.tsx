import { ReloadIcon, StopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { ProviderIcon } from '@/components/ui/ProviderIcons'
import {
  getChecklistCopyText,
  resolveChecklistDisplay,
} from '@/lib/chat/checklist'
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

  const getCopyText = () => {
    if (!generation.content) return ''
    const display = resolveChecklistDisplay(generation.content, false)
    return display?.status === 'ready'
      ? getChecklistCopyText(display.checklist)
      : generation.content
  }

  const displayError = humanizeGenerationError(generation.error)
  const contentAsError =
    displayError.technicalDetail === null && generation.content?.trim()
      ? humanizeGenerationError(generation.content)
      : null
  const userMessage = contentAsError?.userMessage ?? displayError.userMessage
  const technicalDetail =
    displayError.technicalDetail ?? contentAsError?.technicalDetail ?? null

  const hasVisibleContent = Boolean(
    generation.content && generation.content.trim().length > 0,
  )
  const isWaiting =
    (generation.status === 'streaming' || generation.status === 'queued') &&
    !hasVisibleContent

  return (
    <div
      data-testid="model-column"
      className="flex min-w-0 min-h-[400px] flex-col overflow-hidden rounded-lg border border-hairline bg-pure-white"
    >
      <div className="sticky top-0 flex items-center justify-between rounded-t-lg border-b border-hairline bg-pure-white p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-md border border-hairline bg-pure-white text-ink">
            <ProviderIcon
              provider={entry?.provider ?? 'zona-router'}
              size={13}
            />
          </span>
          <span className="text-[14px] font-semibold text-ink">
            {entry?.displayName ?? generation.modelId}
          </span>
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

      <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
        {generation.status === 'failed' ? (
          <div className="flex min-w-0 flex-col items-center justify-center gap-3 py-8 text-center">
            <InlineError
              code={
                typeof generation.error === 'object' &&
                generation.error !== null &&
                'code' in generation.error &&
                typeof (generation.error as { code?: unknown }).code ===
                  'string'
                  ? (generation.error as { code: string }).code
                  : undefined
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
            <ReasoningSection content={generation.reasoningContent} />
            <ChecklistAwareContent
              content={generation.content ?? ''}
              isStreaming={generation.status === 'streaming'}
              storageKey={`gen:${generation.id}`}
              renderMarkdown={(text) => (
                <div className="prose prose-sm max-w-none min-w-0 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-ink">
                  {text ? (
                    <ReactMarkdown
                      rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                      components={{
                        code: ({ children, className }) => {
                          const isBlock =
                            String(children).includes('\n') ||
                            Boolean(className)
                          if (isBlock)
                            return <CodeBlock>{String(children)}</CodeBlock>
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
