import { MarkdownContent } from '@/components/chat/MarkdownContent'
import type { ArtifactDetail, ArtifactSummary } from '@/lib/artifacts/contracts'
import type { ArtifactWorkspaceState } from '@/lib/artifacts/workspace-state'
import { ArtifactHeader } from './ArtifactHeader'
import { ArtifactTabs } from './ArtifactTabs'
import { useArtifactContent } from './useArtifactContent'

export type ArtifactCanvasProps = {
  summaries: ArtifactSummary[]
  detailsByArtifactId: Record<string, ArtifactDetail>
  workspace: ArtifactWorkspaceState
  onSelectTab: (artifactId: string) => void
  onVersionChange: (input: { artifactId: string; versionId: string }) => void
  onCloseTab: (artifactId: string) => void
  onClosePanel: () => void
  onBackToChat: () => void
  onCopy: (source: string) => void
}

export function ArtifactCanvas({
  summaries,
  detailsByArtifactId,
  workspace,
  onSelectTab,
  onVersionChange,
  onCloseTab,
  onClosePanel,
  onBackToChat,
  onCopy,
}: ArtifactCanvasProps) {
  const openSummaries = workspace.openArtifactIds.flatMap((artifactId) => {
    const summary = summaries.find((entry) => entry.artifactId === artifactId)
    return summary ? [summary] : []
  })
  const activeSummary =
    openSummaries.find(
      (entry) => entry.artifactId === workspace.activeArtifactId,
    ) ?? null

  if (!workspace.isArtifactPanelOpen || !activeSummary) {
    return (
      <section
        aria-label="Artifact canvas"
        data-testid="artifact-canvas"
        className="flex h-full min-h-0 flex-col bg-paper"
      >
        <p data-testid="artifact-canvas-empty" className="p-4 text-[14px]">
          No artifact selected.
        </p>
      </section>
    )
  }

  return (
    <ActiveArtifactCanvas
      openSummaries={openSummaries}
      activeSummary={activeSummary}
      detail={detailsByArtifactId[activeSummary.artifactId]}
      workspace={workspace}
      onSelectTab={onSelectTab}
      onVersionChange={onVersionChange}
      onCloseTab={onCloseTab}
      onClosePanel={onClosePanel}
      onBackToChat={onBackToChat}
      onCopy={onCopy}
    />
  )
}

function ActiveArtifactCanvas({
  openSummaries,
  activeSummary,
  detail,
  workspace,
  onSelectTab,
  onVersionChange,
  onCloseTab,
  onClosePanel,
  onBackToChat,
  onCopy,
}: {
  openSummaries: ArtifactSummary[]
  activeSummary: ArtifactSummary
  detail: ArtifactDetail | undefined
  workspace: ArtifactWorkspaceState
  onSelectTab: (artifactId: string) => void
  onVersionChange: (input: { artifactId: string; versionId: string }) => void
  onCloseTab: (artifactId: string) => void
  onClosePanel: () => void
  onBackToChat: () => void
  onCopy: (source: string) => void
}) {
  const versions = detail?.versions ?? []
  const activeVersionId =
    workspace.activeVersionByArtifactId[activeSummary.artifactId] ??
    activeSummary.currentVersionId
  const content = useArtifactContent({
    artifactId: activeSummary.artifactId,
    versionId: activeVersionId,
    enabled: activeVersionId.length > 0,
  })

  return (
    <section
      aria-label="Artifact canvas"
      data-testid="artifact-canvas"
      className="flex h-full min-h-0 flex-col border-l border-hairline bg-paper"
    >
      <div className="shrink-0 border-b border-hairline bg-pure-white">
        <div className="flex shrink-0 items-center gap-2 px-2 pt-2">
          <button
            type="button"
            aria-label="Back to chat"
            data-testid="artifact-back-to-chat"
            onClick={onBackToChat}
            className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-[13px] font-medium text-stone hover:text-ink md:hidden"
          >
            Back
          </button>
          <ArtifactTabs
            summaries={openSummaries}
            activeArtifactId={activeSummary.artifactId}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
          />
        </div>
        <ArtifactHeader
          summary={activeSummary}
          versions={versions}
          activeVersionId={activeVersionId}
          source={content.source}
          onVersionChange={onVersionChange}
          onCloseTab={onCloseTab}
          onClosePanel={onClosePanel}
          onCopy={onCopy}
        />
      </div>

      <div
        data-testid="artifact-preview"
        className="zona-scroll min-h-0 flex-1 overflow-y-auto bg-pure-white p-4"
      >
        {content.isPending ? (
          <p role="status" data-testid="artifact-preview-loading">
            Loading artifact preview…
          </p>
        ) : content.error ? (
          <div role="alert" data-testid="artifact-preview-error">
            <p>{content.error}</p>
            <button
              type="button"
              aria-label={`Retry loading ${activeSummary.title}`}
              data-testid="artifact-preview-retry"
              onClick={() => content.refetch()}
              className="mt-2 inline-flex h-8 items-center rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-medium text-ink"
            >
              Retry
            </button>
          </div>
        ) : (
          <MarkdownContent text={content.source ?? ''} />
        )}
      </div>
    </section>
  )
}
