import { Download01Icon, File01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { KeyboardEvent, MouseEvent } from 'react'
import type { ArtifactDescriptor } from '@/lib/artifacts/contracts'
import type { ArtifactKind } from '@/lib/chat/skills'

type LegacyArtifactDescriptor = {
  kind: ArtifactKind
  attachmentId: string
  fileName: string
  fileSize: number
  mimeType: string
}

export type FileCardProps = {
  artifact: ArtifactDescriptor | LegacyArtifactDescriptor
  onOpen?: (artifact: ArtifactDescriptor) => void
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

export function FileCard({ artifact, onOpen }: FileCardProps) {
  const downloadUrl = `/api/attachments/${artifact.attachmentId}?download=1`
  const openableArtifact = 'artifactId' in artifact ? artifact : null
  const badgeLabel =
    artifact.mimeType === 'text/markdown'
      ? 'Markdown'
      : (artifact.fileName.split('.').pop()?.toUpperCase() ?? 'File')

  const openArtifact = () => {
    if (openableArtifact) onOpen?.(openableArtifact)
  }
  const handleOpenKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openArtifact()
  }
  const stopDownloadPropagation = (event: MouseEvent<HTMLAnchorElement>) => {
    event.stopPropagation()
  }

  const content = (
    <>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-paper text-ink">
        <HugeiconsIcon
          icon={File01Icon}
          size={20}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </div>

      <div className="min-w-0 text-left">
        <p
          data-testid="artifact-file-name"
          className="truncate text-[14px] font-semibold text-ink"
          title={artifact.fileName}
        >
          {artifact.fileName}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-stone">
          <span className="rounded bg-paper px-1.5 py-0.2 font-mono text-[10px] font-medium uppercase text-stone">
            {badgeLabel}
          </span>
          <span aria-hidden="true">•</span>
          <span data-testid="artifact-file-size">
            {formatFileSize(artifact.fileSize)}
          </span>
        </div>
      </div>
    </>
  )

  return (
    <div
      data-testid="artifact-file-card"
      className="my-3 flex w-full max-w-md items-center justify-between gap-2 rounded-xl border border-hairline bg-pure-white p-2 transition-colors hover:border-hairline-strong"
    >
      {openableArtifact && onOpen ? (
        <button
          type="button"
          onClick={openArtifact}
          onKeyDown={handleOpenKeyDown}
          className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-1.5 text-left hover:bg-paper"
        >
          {content}
        </button>
      ) : (
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-3 px-1.5">
          {content}
        </div>
      )}

      <a
        href={downloadUrl}
        download={artifact.fileName}
        data-testid="artifact-download-btn"
        onClick={stopDownloadPropagation}
        className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink transition-colors duration-150 hover:bg-paper"
      >
        <HugeiconsIcon
          icon={Download01Icon}
          size={15}
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span>Download</span>
      </a>
    </div>
  )
}
