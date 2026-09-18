import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ArtifactDescriptor } from '@/lib/artifacts/contracts'
import { getCompareGridClasses } from '@/lib/chat/compare-card-width'
import { ModelColumn } from './ModelColumn'
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
  artifact?: ArtifactDescriptor
  webSources?: Array<{
    url: string
    title: string | null
    snippet: string | null
    position: number
    score?: number | null
  }>
}

type ComparisonRun = {
  id: string
  userMessage?: { content: string } | null
  userMessageContent?: string
  content?: string
}

type Props = {
  comparisonRun?: ComparisonRun | null
  generations: Generation[]
  onRetry?: (generationId: string) => void
  onStop?: (generationId: string) => void
  onOpenArtifact?: (artifact: ArtifactDescriptor) => void
  onOpenArtifacts?: (artifacts: ArtifactDescriptor[]) => void
  userPrompt?: string
}

export function CompareGrid({
  comparisonRun,
  generations,
  onRetry,
  onStop,
  onOpenArtifact,
  onOpenArtifacts,
  userPrompt,
}: Props) {
  const catalog = useModelCatalog()
  const prompt =
    userPrompt ??
    comparisonRun?.userMessage?.content ??
    comparisonRun?.userMessageContent ??
    comparisonRun?.content ??
    ''

  const { containerClass, gridClass } = getCompareGridClasses(generations)
  const successfulArtifacts = generations.flatMap((generation) =>
    generation.status === 'completed' && generation.artifact
      ? [generation.artifact]
      : [],
  )

  const disabledGenerations = generations.filter((g) => {
    const entry = findCatalogEntry(catalog, g.modelId)
    return entry?.isActive === false
  })

  return (
    <div className={`space-y-4 ${containerClass}`}>
      {prompt && (
        <div className="flex w-full justify-end py-3">
          <div className="max-w-[min(78%,680px)] rounded-[20px] rounded-br-[4px] bg-accent px-4 py-2.5 text-[15px] font-normal leading-[1.5] text-white shadow-sm shadow-black/10 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {prompt}
          </div>
        </div>
      )}
      {disabledGenerations.length > 0 && (
        <div
          data-testid="compare-disabled-warning"
          className="flex items-center gap-2.5 rounded-lg border border-warning-strong/25 bg-warning-soft px-3.5 py-2.5 text-[13px] text-warning-strong dark:border-amber-700/30 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            size={16}
            strokeWidth={2}
            className="shrink-0 text-warning-strong dark:text-amber-400"
            aria-hidden="true"
          />
          <div className="flex flex-wrap items-center gap-1.5 text-[13px] leading-snug">
            <span className="font-semibold">Sedang tidak tersedia:</span>
            <span>
              {disabledGenerations.length === 1
                ? `Model ${findCatalogEntry(catalog, disabledGenerations[0].modelId)?.displayName ?? disabledGenerations[0].modelId} dinonaktifkan sementara oleh administrator.`
                : 'Beberapa model dalam perbandingan ini dinonaktifkan sementara oleh administrator.'}
            </span>
          </div>
        </div>
      )}
      {onOpenArtifacts && successfulArtifacts.length > 0 ? (
        <div className="flex justify-end">
          <button
            type="button"
            data-testid="compare-open-all"
            onClick={() => onOpenArtifacts(successfulArtifacts)}
            className="inline-flex min-h-10 cursor-pointer items-center rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-medium text-ink transition-colors hover:bg-paper"
          >
            Open all files
          </button>
        </div>
      ) : null}
      <div data-testid="compare-grid" className={gridClass}>
        {generations.map((g) => {
          const entry = findCatalogEntry(catalog, g.modelId)
          const isDisabled = entry?.isActive === false
          return (
            <div
              key={g.id}
              data-testid={`compare-column-${g.modelId}`}
              className="flex h-full flex-col min-w-0"
            >
              {isDisabled && (
                <div
                  data-testid={`column-disabled-indicator-${g.modelId}`}
                  className="mb-2.5 flex items-center justify-between gap-2 rounded-md border border-warning-strong/20 bg-warning-soft/80 px-2.5 py-1.5 text-xs text-warning-strong dark:border-amber-700/30 dark:bg-amber-950/25 dark:text-amber-200"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      size={13}
                      strokeWidth={2}
                      className="shrink-0 text-warning-strong dark:text-amber-400"
                      aria-hidden="true"
                    />
                    <span className="font-semibold text-[11px] tracking-wide uppercase">
                      Sedang tidak tersedia
                    </span>
                  </div>
                  {entry?.disabledReason && (
                    <span
                      className="truncate text-[11px] text-warning-strong/80 dark:text-amber-300/80"
                      title={entry.disabledReason}
                    >
                      {entry.disabledReason}
                    </span>
                  )}
                </div>
              )}
              <ModelColumn
                generation={g}
                onRetry={isDisabled ? undefined : onRetry}
                onStop={onStop}
                onOpenArtifact={onOpenArtifact}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
