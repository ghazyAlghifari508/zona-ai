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
  const prompt =
    userPrompt ??
    comparisonRun?.userMessage?.content ??
    comparisonRun?.userMessageContent ??
    comparisonRun?.content ??
    ''

  return (
    <div className="space-y-4">
      {prompt && (
        <div className="mx-auto flex w-full max-w-[860px] justify-end">
          <div className="max-w-[70%] rounded-lg border border-hairline bg-pure-white px-3 py-2 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-ink">
            {prompt}
          </div>
        </div>
      )}
      <div
        data-testid="compare-grid"
        className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5"
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
