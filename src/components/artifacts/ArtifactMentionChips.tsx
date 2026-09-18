import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type {
  ArtifactMentionDraft,
  ArtifactMentionMode,
} from '@/lib/artifacts/mentions'

type Props = {
  mentions: readonly ArtifactMentionDraft[]
  onRemove: (artifactId: string) => void
  onModeChange?: (artifactId: string, mode: ArtifactMentionMode) => void
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
      {mentions.map((mention) => (
        <div
          key={mention.artifactId}
          className="flex items-center gap-1.5 rounded-lg border border-hairline bg-pure-white py-1 pl-2.5 pr-1.5 text-[12px] shadow-2xs transition-all"
          data-testid={`mention-chip-${mention.artifactId}`}
        >
          <span
            className="max-w-[160px] truncate font-medium text-ink"
            title={mention.title}
          >
            @{mention.title}
          </span>
          <span className="rounded bg-sandstone/30 px-1 py-0.2 text-[10px] text-graphite">
            v{mention.version}
          </span>

          {onModeChange ? (
            <button
              type="button"
              onClick={() =>
                onModeChange(
                  mention.artifactId,
                  mention.mode === 'revise' ? 'context' : 'revise',
                )
              }
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                mention.mode === 'revise'
                  ? 'bg-notion-blue/10 text-notion-blue hover:bg-notion-blue/20'
                  : 'bg-stone/10 text-stone hover:bg-stone/20'
              }`}
              title={
                mention.mode === 'revise'
                  ? 'Mode: Revisi (klik untuk ubah ke Referensi)'
                  : 'Mode: Referensi (klik untuk ubah ke Revisi)'
              }
            >
              {mention.mode === 'revise' ? 'Revisi' : 'Referensi'}
            </button>
          ) : (
            <span className="rounded bg-sandstone/20 px-1 py-0.2 text-[10px] text-stone">
              {mention.mode === 'revise' ? 'Revisi' : 'Referensi'}
            </span>
          )}

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
      ))}
    </section>
  )
}
