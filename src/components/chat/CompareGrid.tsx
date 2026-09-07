import type { ArtifactDescriptor } from '@/lib/artifacts/contracts'
import { getCompareGridClasses } from '@/lib/chat/compare-card-width'
import { ModelColumn } from './ModelColumn'

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
  artifact?: ArtifactDescriptor
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
  const prompt =
    userPrompt ??
    comparisonRun?.userMessage?.content ??
    comparisonRun?.userMessageContent ??
    comparisonRun?.content ??
    ''

  const { containerClass, gridClass } = getCompareGridClasses(generations)
  void onOpenArtifacts

  return (
    <div className={`space-y-4 ${containerClass}`}>
      {prompt && (
        <div className="flex w-full justify-end py-3">
          <div className="max-w-[min(78%,680px)] rounded-[20px] rounded-br-[4px] bg-accent px-4 py-2.5 text-[15px] font-normal leading-[1.5] text-white shadow-sm shadow-black/10 whitespace-pre-wrap [overflow-wrap:anywhere]">
            {prompt}
          </div>
        </div>
      )}
      <div data-testid="compare-grid" className={gridClass}>
        {generations.map((g) => (
          <ModelColumn
            key={g.id}
            generation={g}
            onRetry={onRetry}
            onStop={onStop}
            onOpenArtifact={onOpenArtifact}
          />
        ))}
      </div>
    </div>
  )
}
