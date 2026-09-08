import {
  CheckmarkCircle02Icon,
  Copy01Icon,
  Download01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { type ChangeEvent, useState } from 'react'
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
  onCloseTab?: (artifactId: string) => void
  onClosePanel?: () => void
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
  onCopy,
}: ArtifactHeaderProps) {
  const catalog = useModelCatalog()
  const [copied, setCopied] = useState(false)

  const displayName =
    findCatalogEntry(catalog, summary.modelId)?.displayName ?? summary.modelId
  const selected =
    versions.find((version) => version.versionId === activeVersionId) ?? null
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
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard is best-effort; callback received exact bytes
    }
  }

  return (
    <div
      data-testid="artifact-header"
      className="flex shrink-0 items-center justify-between gap-3 border-b border-hairline bg-pure-white px-3 py-2"
    >
      <div className="min-w-0 flex-1">
        <h2
          data-testid="artifact-header-title"
          className="truncate text-[13px] font-semibold leading-tight text-ink"
        >
          {summary.title}
        </h2>
        <p
          data-testid="artifact-header-model"
          className="truncate text-[11px] leading-tight text-stone"
        >
          {displayName}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
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
          className="h-7 shrink-0 rounded border border-hairline bg-pure-white px-1.5 text-[12px] text-ink"
        >
          {versions.length === 0 ? (
            <option value={activeVersionId}>
              {`v${summary.currentVersion}`}
            </option>
          ) : (
            versions.map((version) => (
              <option key={version.versionId} value={version.versionId}>
                {`v${version.version}`}
              </option>
            ))
          )}
        </select>

        <button
          type="button"
          aria-label={`Copy ${summary.title}`}
          title={copied ? 'Disalin!' : 'Salin isi file'}
          data-testid="artifact-copy"
          disabled={source === undefined}
          onClick={handleCopy}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-hairline bg-pure-white text-stone transition-colors duration-150 hover:border-hairline-strong hover:bg-ink/5 hover:text-ink disabled:opacity-40"
        >
          <HugeiconsIcon
            icon={copied ? CheckmarkCircle02Icon : Copy01Icon}
            size={14}
            strokeWidth={1.75}
            className={copied ? 'text-green-600' : ''}
            aria-hidden="true"
          />
        </button>

        {download ? (
          <a
            href={`/api/attachments/${download.attachmentId}?download=1`}
            download={download.fileName}
            aria-label={`Download ${summary.title} version ${download.version}`}
            title={`Unduh ${download.fileName}`}
            data-testid="artifact-download"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-hairline bg-pure-white text-stone transition-colors duration-150 hover:border-hairline-strong hover:bg-ink/5 hover:text-ink"
          >
            <HugeiconsIcon
              icon={Download01Icon}
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </a>
        ) : (
          <button
            type="button"
            aria-label={`Download ${summary.title} unavailable`}
            title="Unduh tidak tersedia"
            data-testid="artifact-download"
            disabled
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-hairline bg-pure-white text-stone opacity-40"
          >
            <HugeiconsIcon
              icon={Download01Icon}
              size={14}
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
    </div>
  )
}
