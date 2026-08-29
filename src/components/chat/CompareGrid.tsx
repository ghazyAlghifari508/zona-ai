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
  userPrompt?: string
}

export function CompareGrid({
  comparisonRun,
  generations,
  onRetry,
  onStop,
  userPrompt,
}: Props) {
  const N = generations.length
  const prompt =
    userPrompt ??
    comparisonRun?.userMessage?.content ??
    comparisonRun?.userMessageContent ??
    comparisonRun?.content ??
    ''

  const gridClass =
    N === 2
      ? 'grid-cols-2'
      : N === 3
        ? 'grid-cols-3'
        : N === 4
          ? 'grid-cols-4'
          : 'grid-cols-2'

  return (
    <div className="space-y-4">
      {prompt && (
        <div className="text-center text-[15px] text-stone-deep">
          You: {prompt}
        </div>
      )}
      <div
        data-testid="compare-grid"
        className={`grid gap-4 overflow-x-auto max-[1024px]:grid-cols-2 max-[768px]:hidden ${gridClass}`}
      >
        {generations.map((g) => (
          <ModelColumn
            key={g.id}
            generation={g}
            onRetry={onRetry}
            onStop={onStop}
          />
        ))}
      </div>
    </div>
  )
}
