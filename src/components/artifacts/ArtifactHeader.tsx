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
}: ArtifactHeaderProps) {
  const catalog = useModelCatalog()
  const displayName =
    findCatalogEntry(catalog, summary.modelId)?.displayName ?? summary.modelId
  const selected =
    versions.find((version) => version.versionId === activeVersionId) ?? null
  const downloadAttachmentId = selected?.attachmentId ?? summary.attachmentId
  const downloadFileName = selected?.fileName ?? summary.fileName
  const downloadVersion = selected?.version ?? summary.currentVersion

  const handleVersionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onVersionChange({
      artifactId: summary.artifactId,
      versionId: event.target.value,
    })
  }

  const handleCopy = () => {
    if (!source) return
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
        className="h-8 shrink-0 rounded-md border border-hairline bg-pure-white px-2 text-[13px] text-ink"
      >
        {versions.map((version) => (
          <option key={version.versionId} value={version.versionId}>
            {`Version ${version.version}`}
          </option>
        ))}
      </select>

      <button
        type="button"
        aria-label={`Copy ${summary.title}`}
        data-testid="artifact-copy"
        disabled={!source}
        onClick={handleCopy}
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-hairline bg-pure-white px-2.5 text-[13px] font-medium text-ink disabled:opacity-50"
      >
        Copy
      </button>
      <a
        href={`/api/attachments/${downloadAttachmentId}?download=1`}
        download={downloadFileName}
        aria-label={`Download ${summary.title} version ${downloadVersion}`}
        data-testid="artifact-download"
        className="inline-flex h-8 shrink-0 items-center rounded-md border border-hairline bg-pure-white px-2.5 text-[13px] font-medium text-ink"
      >
        Download
      </a>
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
