import { useEffect, useState } from 'react'
import {
  getCompareGridClasses,
  shouldExpandCompareCard,
} from '@/lib/chat/compare-card-width'
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

  const [expandedGenIds, setExpandedGenIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const g of generations) {
      if (shouldExpandCompareCard(g.content)) {
        initial.add(g.id)
      }
    }
    return initial
  })

  useEffect(() => {
    setExpandedGenIds((prev) => {
      let changed = false
      const next = new Set(prev)
      for (const g of generations) {
        if (!next.has(g.id) && shouldExpandCompareCard(g.content)) {
          next.add(g.id)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [generations])

  const { containerClass, gridClass } = getCompareGridClasses(
    generations,
    expandedGenIds,
  )

  return (
    <div className={`space-y-4 ${containerClass}`}>
      {prompt && (
        <div className="mx-auto flex w-full max-w-[860px] justify-end">
          <div className="max-w-[70%] rounded-lg border border-hairline bg-pure-white px-3 py-2 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-ink">
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
          />
        ))}
      </div>
    </div>
  )
}
