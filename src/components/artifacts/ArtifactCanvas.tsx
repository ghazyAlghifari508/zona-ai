import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { MarkdownContent } from '@/components/chat/MarkdownContent'
import {
  getStoredArtifactMarkdown,
  setStoredArtifactMarkdown,
  toggleMarkdownTask,
} from '@/lib/artifacts/checklist-toggle'
import type { ArtifactDetail, ArtifactSummary } from '@/lib/artifacts/contracts'
import {
  type ArtifactWorkspaceState,
  artifactVersionKey,
} from '@/lib/artifacts/workspace-state'
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
  onRememberScroll: (input: {
    artifactId: string
    versionId: string
    scrollTop: number
  }) => void
  onAddMention?: (input: {
    artifactId: string
    versionId: string
    mode: 'context' | 'revise'
  }) => void
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
  onRememberScroll,
  onAddMention,
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
      onRememberScroll={onRememberScroll}
      onAddMention={onAddMention}
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
  onRememberScroll,
  onAddMention,
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
  onRememberScroll: (input: {
    artifactId: string
    versionId: string
    scrollTop: number
  }) => void
  onAddMention?: (input: {
    artifactId: string
    versionId: string
    mode: 'context' | 'revise'
  }) => void
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
  const previewRef = useRef<HTMLDivElement>(null)
  const versionKey = artifactVersionKey(
    activeSummary.artifactId,
    activeVersionId,
  )
  const [localMarkdown, setLocalMarkdown] = useState<string | null>(() =>
    getStoredArtifactMarkdown(versionKey),
  )

  useEffect(() => {
    setLocalMarkdown(getStoredArtifactMarkdown(versionKey))
  }, [versionKey])

  const activeSource = localMarkdown ?? content.source ?? ''

  const handleToggleTask = (taskIndex: number, nextChecked: boolean) => {
    const updated = toggleMarkdownTask(activeSource, taskIndex, nextChecked)
    setLocalMarkdown(updated)
    setStoredArtifactMarkdown(versionKey, updated)
  }

  const savedScrollTop = workspace.scrollTopByVersionKey[versionKey] ?? 0
  const recordedVersionKeyRef = useRef<string | null>(null)
  const rememberOnCleanup = useEffectEvent(
    (artifactId: string, versionId: string, key: string) => {
      if (recordedVersionKeyRef.current === key) return
      onRememberScroll({
        artifactId,
        versionId,
        scrollTop: previewRef.current?.scrollTop ?? 0,
      })
    },
  )

  useLayoutEffect(() => {
    recordedVersionKeyRef.current = null
    if (previewRef.current) previewRef.current.scrollTop = savedScrollTop
    return () => {
      rememberOnCleanup(activeSummary.artifactId, activeVersionId, versionKey)
    }
  }, [activeSummary.artifactId, activeVersionId, savedScrollTop, versionKey])

  const rememberCurrentScroll = () => {
    recordedVersionKeyRef.current = versionKey
    onRememberScroll({
      artifactId: activeSummary.artifactId,
      versionId: activeVersionId,
      scrollTop: previewRef.current?.scrollTop ?? 0,
    })
  }
  const handleSelectTab = (artifactId: string) => {
    if (artifactId === activeSummary.artifactId) return
    rememberCurrentScroll()
    onSelectTab(artifactId)
  }
  const handleVersionChange = (input: {
    artifactId: string
    versionId: string
  }) => {
    if (input.versionId === activeVersionId) return
    rememberCurrentScroll()
    onVersionChange(input)
  }
  const handleCloseTab = (artifactId: string) => {
    if (artifactId === activeSummary.artifactId) rememberCurrentScroll()
    onCloseTab(artifactId)
  }

  return (
    <section
      aria-label="Artifact canvas"
      data-testid="artifact-canvas"
      className="flex h-full min-h-0 flex-col bg-paper"
    >
      <div className="shrink-0 border-b border-hairline bg-pure-white">
        <div className="flex shrink-0 items-center gap-2 px-2 pt-20 md:pt-12">
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
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
          />
        </div>
        <ArtifactHeader
          summary={activeSummary}
          versions={versions}
          activeVersionId={activeVersionId}
          source={activeSource}
          onVersionChange={handleVersionChange}
          onCloseTab={handleCloseTab}
          onClosePanel={onClosePanel}
          onCopy={onCopy}
          onAddMention={onAddMention}
        />
      </div>

      <div
        ref={previewRef}
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
          <MarkdownContent
            text={activeSource}
            onToggleTask={handleToggleTask}
          />
        )}
      </div>
    </section>
  )
}
