import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  ArtifactMentionDraft,
  ArtifactMentionMode,
} from '@/lib/artifacts/mentions'

type Props = {
  mentions: readonly ArtifactMentionDraft[]
  onRemove: (artifactId: string) => void
  onModeChange: (artifactId: string, mode: ArtifactMentionMode) => void
}

export function ArtifactMentionChips({
  mentions,
  onRemove,
  onModeChange,
}: Props) {
  if (mentions.length === 0) return null

  return (
    <section
      aria-label="Mentioned Artifacts"
      className="mb-2 flex flex-wrap items-center gap-1.5 px-1"
      data-testid="artifact-mention-chips"
    >
      {mentions.map((mention) => {
        const isRevise = mention.mode === 'revise'
        return (
          <div
            key={mention.artifactId}
            className="flex items-center gap-1.5 rounded-lg border border-hairline bg-pure-white py-1 pl-2.5 pr-1.5 text-[12px] shadow-sm transition-all"
            data-testid={`mention-chip-${mention.artifactId}`}
          >
            <span
              className="max-w-[140px] truncate font-medium text-ink"
              title={mention.title}
            >
              @{mention.title}
            </span>
            <span className="rounded bg-sandstone/30 px-1 py-0.2 text-[10px] text-graphite">
              v{mention.version}
            </span>

            <button
              type="button"
              onClick={() =>
                onModeChange(
                  mention.artifactId,
                  isRevise ? 'context' : 'revise',
                )
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                isRevise
                  ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                  : 'bg-sandstone/40 text-graphite hover:bg-sandstone/60'
              }`}
              title={`Mode: ${isRevise ? 'Revise (ubah dokumen ini)' : 'Context (hanya baca)'}. Klik untuk ganti.`}
              aria-label={`Ganti mode mention ${mention.title}`}
            >
              {isRevise ? 'Revise' : 'Context'}
            </button>

            <button
              type="button"
              onClick={() => onRemove(mention.artifactId)}
              className="rounded p-0.5 text-stone transition-colors hover:text-coral focus:outline-none"
              title="Hapus mention"
              aria-label={`Hapus mention ${mention.title}`}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
            </button>
          </div>
        )
      })}
    </section>
  )
}
