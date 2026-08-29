import { Bot, Copy, RotateCw, Square, Timer } from 'lucide-react'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize from 'rehype-sanitize'
import { CodeBlock } from './CodeBlock'

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
}

type Props = {
  generation: Generation
  onRetry?: (generationId: string) => void
  onStop?: (generationId: string) => void
  onCopy?: (content: string) => void
}

export function ModelColumn({ generation, onRetry, onStop, onCopy }: Props) {
  const [copied, setCopied] = useState(false)
  const statusDotClass =
    generation.status === 'streaming'
      ? 'bg-fresh-grass'
      : generation.status === 'completed'
        ? 'bg-stone-gray'
        : generation.status === 'failed'
          ? 'bg-coral-pop'
          : generation.status === 'cancelled'
            ? 'bg-hairline-mist'
            : 'bg-sandstone'

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
      className="flex min-h-[400px] flex-col rounded-[50px] border border-hairline-mist bg-pure-white"
    >
      <div className="sticky top-0 flex items-center justify-between rounded-t-[50px] border-b border-hairline-mist bg-pure-white p-3">
        <div className="flex items-center gap-2">
          <Bot size={16} strokeWidth={1.75} className="text-ink-black" />
          <span className="text-[15px] font-medium text-ink-black">
            {generation.modelId}
          </span>
          <span
            className={`h-2 w-2 rounded-full ${statusDotClass}`}
            data-testid={`status-dot-${generation.status}`}
          />
          {generation.status === 'streaming' && (
            <span className="text-xs text-stone-gray">Streaming</span>
          )}
          {generation.status === 'completed' && (
            <span className="text-xs text-stone-gray">Completed</span>
          )}
          {generation.status === 'failed' && (
            <span className="text-xs text-stone-gray">Failed</span>
          )}
          {generation.status === 'cancelled' && (
            <span className="text-xs text-stone-gray">Cancelled</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {generation.status === 'failed' && onRetry && (
            <button
              type="button"
              data-testid={`retry-${generation.id}`}
              onClick={() => onRetry(generation.id)}
              className="inline-flex items-center gap-1 rounded-full border border-hairline-mist bg-pure-white px-2 py-1 text-xs text-ink-black hover:bg-sandstone"
            >
              <RotateCw size={14} strokeWidth={1.75} /> Coba lagi
            </button>
          )}
          {generation.status === 'streaming' && onStop && (
            <button
              type="button"
              data-testid={`stop-${generation.id}`}
              onClick={() => onStop(generation.id)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-hairline-mist bg-pure-white text-ink-black hover:bg-sandstone"
              aria-label="Stop"
            >
              <Square size={14} strokeWidth={1.75} fill="currentColor" />
            </button>
          )}
          {generation.status === 'completed' && generation.content && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-hairline-mist bg-pure-white text-stone-gray hover:bg-sandstone hover:text-ink-black"
              aria-label="Copy"
              data-testid={`copy-${generation.id}`}
            >
              <Copy size={14} strokeWidth={1.75} />
            </button>
          )}
          {copied && <span className="text-xs text-stone-gray">Copied</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {generation.status === 'failed' ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-[15px] text-stone-gray">Model gagal</p>
            {onRetry && (
              <button
                type="button"
                onClick={() => onRetry(generation.id)}
                className="mt-2 inline-flex items-center gap-1 rounded-[10px] border border-hairline-mist bg-pure-white px-3 py-1.5 text-sm text-ink-black hover:bg-sandstone"
              >
                <RotateCw size={14} strokeWidth={1.75} /> Coba lagi
              </button>
            )}
          </div>
        ) : generation.status === 'queued' ? (
          <div className="space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-sandstone" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-sandstone" />
          </div>
        ) : (
          <div className="prose prose-sm max-w-none text-[15px] leading-relaxed text-ink-black">
            {generation.reasoningContent && (
              <details className="mb-2 rounded-[10px] border border-hairline-mist bg-cream-paper p-2">
                <summary className="cursor-pointer text-xs text-stone-gray">
                  Reasoning
                </summary>
                <div className="mt-1 text-sm text-ink-black">
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
                      <code className="rounded bg-sandstone px-1 py-0.5 text-[14px]">
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
              <span className="inline-block animate-pulse text-stone-gray">
                ▌ Menunggu model...
              </span>
            ) : null}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-hairline-mist p-3 text-xs text-stone-gray">
        <Timer size={12} strokeWidth={1.75} />
        <span>{generation.totalTokens ?? '-'} tokens</span>
        <span>·</span>
        <span>{generation.timeToFirstTokenMs ?? '-'}ms TTFT</span>
        <span>·</span>
        <span>{generation.latencyMs ?? '-'}ms</span>
      </div>
    </div>
  )
}
