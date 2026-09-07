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
    if (
      event.key !== 'ArrowRight' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return
    }
    event.preventDefault()
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    )
    if (tabs.length === 0) return
    const focused = document.activeElement
    const currentIndex =
      focused instanceof HTMLButtonElement ? tabs.indexOf(focused) : -1
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
      className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
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
            role="presentation"
            className="flex min-w-0 shrink items-center"
          >
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-label={accessibleName}
              title={accessibleName}
              tabIndex={isActive ? 0 : -1}
              data-testid={`artifact-tab-${summary.artifactId}`}
              onClick={() => onSelectTab(summary.artifactId)}
              className="min-w-0 max-w-44 truncate rounded-md px-2.5 py-1.5 text-[13px] font-medium text-stone aria-selected:bg-sky-tint aria-selected:font-semibold aria-selected:text-ink"
            >
              <span aria-hidden="true" className="block truncate">
                {summary.title}
              </span>
            </button>
            <button
              type="button"
              aria-label={`Close ${summary.title}`}
              data-testid={`artifact-close-${summary.artifactId}`}
              onClick={() => onCloseTab(summary.artifactId)}
              className="mr-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-stone hover:bg-ink/5 hover:text-ink"
            >
              <span aria-hidden="true" className="text-[14px] leading-none">
                ×
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
