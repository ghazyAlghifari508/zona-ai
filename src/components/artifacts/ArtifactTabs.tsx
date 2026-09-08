import type { KeyboardEvent } from 'react'
import {
  findCatalogEntry,
  useModelCatalog,
} from '@/components/chat/useModelCatalog'
import type { ArtifactSummary } from '@/lib/artifacts/contracts'

export type ArtifactTabsProps = {
  summaries: ArtifactSummary[]
  activeArtifactId: string | null
  onSelectTab: (artifactId: string) => void
  onCloseTab: (artifactId: string) => void
}

export function ArtifactTabs({
  summaries,
  activeArtifactId,
  onSelectTab,
  onCloseTab,
}: ArtifactTabsProps) {
  const catalog = useModelCatalog()

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.target instanceof HTMLElement)) return
    if (event.target.getAttribute('role') !== 'tab') return
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End' &&
      event.key !== 'Enter' &&
      event.key !== ' '
    ) {
      return
    }
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
    )
    if (tabs.length === 0) return
    const focused = document.activeElement
    const currentIndex =
      focused instanceof HTMLElement ? tabs.indexOf(focused) : -1

    if (event.key === 'Enter' || event.key === ' ') {
      if (currentIndex !== -1 && summaries[currentIndex]) {
        event.preventDefault()
        onSelectTab(summaries[currentIndex].artifactId)
      }
      return
    }

    event.preventDefault()
    const anchor = currentIndex === -1 ? 0 : currentIndex
    let nextIndex = anchor
    if (event.key === 'ArrowRight') nextIndex = (anchor + 1) % tabs.length
    if (event.key === 'ArrowLeft') {
      nextIndex = (anchor - 1 + tabs.length) % tabs.length
    }
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = tabs.length - 1
    tabs[nextIndex]?.focus()
    const next = summaries[nextIndex]
    if (next) onSelectTab(next.artifactId)
  }

  if (summaries.length === 0) return null

  return (
    <div
      role="tablist"
      aria-label="Open artifacts"
      data-testid="artifact-tabs"
      onKeyDown={handleKeyDown}
      className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden py-1"
    >
      {summaries.map((summary) => {
        const isActive = summary.artifactId === activeArtifactId
        const displayName =
          findCatalogEntry(catalog, summary.modelId)?.displayName ??
          summary.modelId
        const accessibleName = `${summary.title} — ${displayName}`
        return (
          <div
            key={summary.artifactId}
            role="tab"
            aria-selected={isActive}
            aria-label={accessibleName}
            title={accessibleName}
            tabIndex={isActive ? 0 : -1}
            data-testid={`artifact-tab-${summary.artifactId}`}
            onClick={() => onSelectTab(summary.artifactId)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onSelectTab(summary.artifactId)
              }
            }}
            className={`group relative flex min-w-0 max-w-48 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] transition-all duration-150 select-none ${
              isActive
                ? 'border border-hairline bg-pure-white font-semibold text-ink shadow-2xs'
                : 'border border-transparent text-stone hover:bg-ink/5 hover:text-ink'
            }`}
          >
            <span aria-hidden="true" className="min-w-0 truncate">
              {summary.title}
            </span>
            <button
              type="button"
              aria-label={`Close ${summary.title}`}
              data-testid={`artifact-close-${summary.artifactId}`}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(summary.artifactId)
              }}
              className="ml-auto inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-stone/70 transition-all hover:bg-ink/10 hover:text-ink"
            >
              <span
                aria-hidden="true"
                className="text-[14px] leading-none font-medium"
              >
                ×
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
