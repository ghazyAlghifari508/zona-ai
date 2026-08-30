import { Copy01Icon, ReloadIcon, StopIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { ProviderIcon } from '@/components/ui/ProviderIcons'
import { CitationDrawer, type CitationSource } from './CitationDrawer'
import { CodeBlock } from './CodeBlock'
import { InlineError } from './InlineError'
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
  const [copied, setCopied] = useState(false)
  const catalog = useModelCatalog()
  const entry = findCatalogEntry(catalog, generation.modelId)

  const handleCopy = async () => {
    if (generation.content) {
      await navigator.clipboard.writeText(generation.content).catch(() => {})
      onCopy?.(generation.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

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
          {generation.status === 'failed' && onRetry && (
            <button
              type="button"
              data-testid={`retry-${generation.id}`}
              onClick={() => onRetry(generation.id)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-notion-blue hover:bg-ink/5"
            >
              <HugeiconsIcon icon={ReloadIcon} size={14} strokeWidth={1.75} />{' '}
              Coba lagi
            </button>
          )}
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
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-stone hover:bg-ink/5 hover:text-ink"
              aria-label="Copy"
              data-testid={`copy-${generation.id}`}
            >
              <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
            </button>
          )}
          {copied && <span className="text-xs text-stone">Tersalin</span>}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4">
        {generation.status === 'failed' ? (
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <InlineError
              code={
                typeof generation.error === 'object' &&
                generation.error !== null &&
                'code' in generation.error
                  ? String(
                      (generation.error as { code?: unknown }).code ??
                        'ERR-001',
                    )
                  : 'ERR-001'
              }
              message={
                (typeof generation.error === 'object' &&
                  generation.error !== null &&
                  'message' in generation.error &&
                  typeof (generation.error as { message?: unknown }).message ===
                    'string' &&
                  (generation.error as { message: string }).message) ||
                generation.content?.trim() ||
                'Model gagal merespons.'
              }
            />
            {onRetry && (
              <button
                type="button"
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
        ) : generation.status === 'queued' ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-paper motion-reduce:animate-none" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-paper motion-reduce:animate-none" />
          </div>
        ) : (
          <>
            <div className="prose prose-sm max-w-none min-w-0 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-ink">
              {generation.reasoningContent && (
                <details className="mb-2 rounded-md border border-hairline bg-paper p-2">
                  <summary className="cursor-pointer text-xs text-stone">
                    Reasoning
                  </summary>
                  <div className="mt-1 text-sm text-ink">
                    {generation.reasoningContent}
                  </div>
                </details>
              )}
              {generation.content ? (
                <ReactMarkdown
                  rehypePlugins={[rehypeSanitize, rehypeHighlight]}
                  components={{
                    code: ({ children, className }) => {
                      const isBlock =
                        String(children).includes('\n') || Boolean(className)
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
                  {generation.content}
                </ReactMarkdown>
              ) : generation.status === 'streaming' ? (
                <TypingDots />
              ) : null}
            </div>
            {generation.webSources && generation.webSources.length > 0 && (
              <CitationDrawer sources={generation.webSources} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
