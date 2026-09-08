import type { ChangeEvent } from 'react'
import {
  findCatalogEntry,
  useModelCatalog,
} from '@/components/chat/useModelCatalog'
import type {
  ArtifactSummary,
  ArtifactVersionDescriptor,
} from '@/lib/artifacts/contracts'

export type ArtifactHeaderProps = {
  summary: ArtifactSummary
  versions: ArtifactVersionDescriptor[]
  activeVersionId: string
  source: string | undefined
  onVersionChange: (input: { artifactId: string; versionId: string }) => void
  onCloseTab: (artifactId: string) => void
  onClosePanel: () => void
  onCopy: (source: string) => void
  onAddMention?: (input: {
    artifactId: string
    versionId: string
    mode: 'context' | 'revise'
  }) => void
}

export function ArtifactHeader({
  summary,
  versions,
  activeVersionId,
  source,
  onVersionChange,
  onCloseTab,
  onClosePanel,
  onCopy,
  onAddMention,
}: ArtifactHeaderProps) {
  const catalog = useModelCatalog()
  const displayName =
    findCatalogEntry(catalog, summary.modelId)?.displayName ?? summary.modelId
  const selected =
    versions.find((version) => version.versionId === activeVersionId) ?? null
  const isCurrentVersion =
    activeVersionId === summary.currentVersionId ||
    (selected !== null && selected.version === summary.currentVersion)
  const download = selected
    ? {
        attachmentId: selected.attachmentId,
        fileName: selected.fileName,
        version: selected.version,
      }
    : activeVersionId === summary.currentVersionId
      ? {
          attachmentId: summary.attachmentId,
          fileName: summary.fileName,
          version: summary.currentVersion,
        }
      : null

  const handleVersionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (!event.target.value) return
    onVersionChange({
      artifactId: summary.artifactId,
      versionId: event.target.value,
    })
  }

  const handleCopy = () => {
    if (source === undefined) return
    onCopy(source)
    try {
      void navigator.clipboard?.writeText(source).catch(() => {})
    } catch {
      // Clipboard is best-effort; the callback already received exact bytes.
    }
  }

  return (
    <div
      data-testid="artifact-header"
      className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline bg-pure-white px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <h2
          data-testid="artifact-header-title"
          className="truncate text-[14px] font-semibold leading-tight text-ink"
        >
          {summary.title}
        </h2>
        <p
          data-testid="artifact-header-model"
          className="truncate text-[12px] leading-tight text-stone"
        >
          {displayName}
        </p>
      </div>

      <label
        htmlFor={`artifact-version-${summary.artifactId}`}
        className="sr-only"
      >
        {`Version for ${summary.title}`}
      </label>
      <select
        id={`artifact-version-${summary.artifactId}`}
        aria-label={`Version for ${summary.title}`}
        data-testid="artifact-version-select"
        value={activeVersionId}
        onChange={handleVersionChange}
        disabled={versions.length === 0}
        className="h-8 shrink-0 rounded-md border border-hairline bg-pure-white px-2 text-[13px] text-ink"
      >
        {versions.length === 0 ? (
          <option value={activeVersionId}>
            {`Version ${summary.currentVersion}`}
          </option>
        ) : (
          versions.map((version) => (
            <option key={version.versionId} value={version.versionId}>
              {`Version ${version.version}`}
            </option>
          ))
        )}
      </select>

      {onAddMention && (
        <>
          <button
            type="button"
            data-testid="artifact-add-to-context"
            onClick={() =>
              onAddMention({
                artifactId: summary.artifactId,
                versionId: activeVersionId,
                mode: 'context',
              })
            }
            className="inline-flex h-8 shrink-0 items-center rounded-md border border-hairline bg-pure-white px-2.5 text-[13px] font-medium text-ink hover:border-hairline-strong hover:bg-cream-paper/40"
            title="Tambahkan versi ini ke context percakapan"
          >
            Tambahkan ke context
          </button>
          {isCurrentVersion && (
            <button
              type="button"
              data-testid="artifact-revise-in-chat"
              onClick={() =>
                onAddMention({
                  artifactId: summary.artifactId,
                  versionId: summary.currentVersionId,
                  mode: 'revise',
                })
              }
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-amber-300 bg-amber-50 px-2.5 text-[13px] font-medium text-amber-900 hover:bg-amber-100"
              title="Revisi artifact ini di chat (membuat versi baru)"
            >
              Revisi di chat
            </button>
          )}
        </>
      )}

      <button
        type="button"
        aria-label={`Copy ${summary.title}`}
        data-testid="artifact-copy"
        disabled={source === undefined}
        onClick={handleCopy}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-hairline bg-pure-white px-2.5 text-[13px] font-medium text-ink disabled:opacity-50"
      >
        Copy
      </button>
      {download ? (
        <a
          href={`/api/attachments/${download.attachmentId}?download=1`}
          download={download.fileName}
          aria-label={`Download ${summary.title} version ${download.version}`}
          data-testid="artifact-download"
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-hairline bg-pure-white px-2.5 text-[13px] font-medium text-ink"
        >
          Download
        </a>
      ) : (
        <button
          type="button"
          aria-label={`Download ${summary.title} unavailable`}
          data-testid="artifact-download"
          disabled
          className="inline-flex h-8 shrink-0 items-center rounded-md border border-hairline bg-pure-white px-2.5 text-[13px] font-medium text-ink opacity-50"
        >
          Download
        </button>
      )}
      <button
        type="button"
        aria-label={`Close ${summary.title} tab`}
        data-testid={`artifact-header-close-${summary.artifactId}`}
        onClick={() => onCloseTab(summary.artifactId)}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-stone hover:bg-ink/5 hover:text-ink"
      >
        <span aria-hidden="true" className="text-[14px] leading-none">
          ×
        </span>
      </button>
      <button
        type="button"
        aria-label="Close artifact panel"
        data-testid="artifact-close-panel"
        onClick={onClosePanel}
        className="inline-flex h-8 shrink-0 items-center rounded-md px-2 text-[13px] font-medium text-stone hover:text-ink"
      >
        Close
      </button>
    </div>
  )
}
