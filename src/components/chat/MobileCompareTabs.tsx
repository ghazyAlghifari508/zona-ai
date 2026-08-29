import { useState } from 'react'
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

type Props = {
  generations: Generation[]
  onRetry?: (generationId: string) => void
  onStop?: (generationId: string) => void
}

export function MobileCompareTabs({ generations, onRetry, onStop }: Props) {
  const [active, setActive] = useState(generations[0]?.id ?? '')
  // touch swipe handling
  const [touchStart, setTouchStart] = useState<number | null>(null)

  const activeIndex = generations.findIndex((g) => g.id === active)
  const safeActive = active || generations[0]?.id
  const activeGen =
    generations.find((g) => g.id === safeActive) ?? generations[0]

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX)
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return
    const diff = e.changedTouches[0].clientX - touchStart
    if (Math.abs(diff) > 50) {
      if (diff < 0 && activeIndex < generations.length - 1) {
        setActive(generations[activeIndex + 1].id)
      } else if (diff > 0 && activeIndex > 0) {
        setActive(generations[activeIndex - 1].id)
      }
    }
    setTouchStart(null)
  }

  if (generations.length === 0) return null

  return (
    <div
      data-testid="mobile-compare-tabs"
      className="hidden max-[768px]:block space-y-3"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="flex rounded-full border border-hairline-mist bg-pure-white p-1 gap-1 overflow-x-auto">
        {generations.map((g) => (
          <button
            key={g.id}
            type="button"
            data-testid={`tab-${g.modelId}`}
            onClick={() => setActive(g.id)}
            className={`flex-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium ${
              safeActive === g.id
                ? 'bg-sandstone border border-ink-black text-ink-black'
                : 'text-stone-gray hover:text-ink-black border border-transparent'
            }`}
          >
            {g.modelId}
          </button>
        ))}
      </div>
      {activeGen && (
        <div data-testid={`model-column-mobile-${activeGen.modelId}`}>
          <ModelColumn
            generation={activeGen}
            onRetry={onRetry}
            onStop={onStop}
          />
        </div>
      )}
      <div className="flex justify-center gap-1">
        {generations.map((g) => (
          <span
            key={g.id}
            className={`h-1.5 w-1.5 rounded-full ${safeActive === g.id ? 'bg-ink-black' : 'bg-hairline-mist'}`}
          />
        ))}
      </div>
    </div>
  )
}
