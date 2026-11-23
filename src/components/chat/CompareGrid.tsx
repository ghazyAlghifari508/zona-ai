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

  return (
    <div className={`space-y-4 ${containerClass}`}>
      {prompt && (
        <div className="flex w-full justify-end py-3">
          <div className="max-w-[min(78%,680px)] rounded-[20px] rounded-br-[4px] bg-accent px-4 py-2.5 text-[15px] font-normal leading-[1.5] text-white shadow-sm shadow-black/10 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {prompt}
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
                  className="mb-2.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-coral"
                >
                  <HugeiconsIcon
                    icon={Alert02Icon}
                    size={13}
                    strokeWidth={2}
                    className="mt-0.5 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 break-words">
                    <span className="font-medium">Tidak tersedia</span>
                    {entry.disabledReason ? ` — ${entry.disabledReason}` : ''}
                  </span>
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
