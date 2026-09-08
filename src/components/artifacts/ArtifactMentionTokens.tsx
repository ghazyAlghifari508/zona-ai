import type { ArtifactKind } from '@/lib/artifacts/contracts'
import type { SafeArtifactMention } from '@/lib/artifacts/mentions'

type Props = {
  mentions: readonly SafeArtifactMention[]
  onOpenArtifact?: (input: { artifactId: string; versionId: string }) => void
}

function kindBadge(kind: ArtifactKind): string {
  switch (kind) {
    case 'prd':
      return 'PRD'
    case 'agent-skill':
      return 'Skill'
    case 'checklist':
      return 'Checklist'
    default:
      return 'Artifact'
  }
}

export function ArtifactMentionTokens({ mentions, onOpenArtifact }: Props) {
  if (mentions.length === 0) return null

  return (
    <fieldset
      aria-label="Mentioned Artifacts"
      className="mb-2 flex flex-wrap items-center gap-1.5 border-none p-0"
      data-testid="artifact-mention-tokens"
    >
      {mentions.map((mention) => {
        const isRevise = mention.mode === 'revise'
        const label = `@${mention.title}`

        return (
          <button
            key={`${mention.artifactId}-${mention.versionId}`}
            type="button"
            data-testid={`mention-token-${mention.artifactId}`}
            onClick={() =>
              onOpenArtifact?.({
                artifactId: mention.artifactId,
                versionId: mention.versionId,
              })
            }
            className="inline-flex max-w-[260px] items-center gap-1.5 rounded-md border border-hairline bg-pure-white px-2 py-0.5 text-left text-[12px] text-ink transition-colors hover:border-hairline-strong hover:bg-cream-paper/50 focus:outline-none focus:ring-1 focus:ring-accent"
            title={`${label} (v${mention.version}) - Mode: ${mention.mode}. Klik untuk buka di canvas.`}
          >
            <span className="truncate font-medium text-ink">{label}</span>
            <span className="rounded bg-sandstone/30 px-1 py-0.2 text-[10px] text-graphite">
              v{mention.version}
            </span>
            <span
              className={`rounded px-1 py-0.2 text-[9px] font-semibold uppercase ${
                isRevise
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-sandstone/40 text-graphite'
              }`}
            >
              {mention.mode}
            </span>
            <span className="text-[10px] text-stone">
              ({kindBadge(mention.kind)})
            </span>
          </button>
        )
      })}
    </fieldset>
  )
}
