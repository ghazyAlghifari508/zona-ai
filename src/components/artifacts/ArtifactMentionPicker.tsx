import { useEffect, useRef } from 'react'
import type { ArtifactMentionCandidate } from '@/lib/artifacts/mentions'

type Props = {
  candidates: readonly ArtifactMentionCandidate[]
  selectedIndex: number
  onSelect: (candidate: ArtifactMentionCandidate) => void
  onClose: () => void
}

export function ArtifactMentionPicker({
  candidates,
  selectedIndex,
  onSelect,
  onClose,
}: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const activeItem = list.children[selectedIndex] as HTMLElement | undefined
    if (activeItem && typeof activeItem.scrollIntoView === 'function') {
      activeItem.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  return (
    <section
      aria-label="Artifact Mentions"
      className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-hairline bg-pure-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      data-testid="artifact-mention-picker"
    >
      <div className="flex items-center justify-between border-b border-hairline/60 px-3 py-2 text-[12px] font-medium text-graphite">
        <span>Sebut Artifact (@)</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-0.5 text-stone hover:text-ink focus:outline-none"
          aria-label="Tutup picker"
        >
          Esc
        </button>
      </div>

      {candidates.length === 0 ? (
        <div className="px-4 py-6 text-center text-[13px] text-stone">
          Tidak ada artifact yang cocok di percakapan ini
        </div>
      ) : (
        <div
          ref={listRef}
          role="listbox"
          aria-label="Daftar Artifact"
          tabIndex={-1}
          className="max-h-[220px] overflow-y-auto py-1 focus:outline-none"
        >
          {candidates.map((candidate, idx) => {
            const isSelected = idx === selectedIndex
            return (
              <div
                key={candidate.artifact.artifactId}
                id={`mention-option-${candidate.artifact.artifactId}`}
                role="option"
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => onSelect(candidate)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    onSelect(candidate)
                  }
                }}
                className={`flex cursor-pointer items-center justify-between px-3.5 py-2 text-left transition-colors ${
                  isSelected
                    ? 'bg-cream-paper/70 text-ink'
                    : 'text-ink hover:bg-cream-paper/40'
                }`}
              >
                <div className="min-w-0 flex-1 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-ink">
                      {candidate.artifact.title}
                    </span>
                    <span className="rounded bg-sandstone/30 px-1.5 py-0.5 text-[10px] font-medium text-graphite">
                      v{candidate.artifact.currentVersion}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-stone">
                    <span className="truncate">
                      {candidate.artifact.fileName}
                    </span>
                    <span>•</span>
                    <span>{candidate.kindLabel}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right text-[11px] text-stone">
                  {candidate.modelDisplayName}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
