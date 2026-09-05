import { Download01Icon, File01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export type FileCardProps = {
  artifact: {
    attachmentId: string
    fileName: string
    fileSize: number
    mimeType: string
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}

export function FileCard({ artifact }: FileCardProps) {
  const downloadUrl = `/api/attachments/${artifact.attachmentId}`

  return (
    <div
      data-testid="prd-file-card"
      className="my-3 flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-hairline bg-pure-white p-3.5 shadow-[0_1px_4px_rgba(0,0,0,0.04)] transition-all hover:border-hairline-strong"
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-hairline bg-paper text-ink">
          <HugeiconsIcon
            icon={File01Icon}
            size={20}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </div>

        <div className="min-w-0">
          <p
            data-testid="prd-file-name"
            className="truncate text-[14px] font-semibold text-ink"
            title={artifact.fileName}
          >
            {artifact.fileName}
          </p>
          <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-stone">
            <span className="rounded bg-paper px-1.5 py-0.2 font-mono text-[10px] font-medium uppercase text-stone">
              Markdown
            </span>
            <span>•</span>
            <span data-testid="prd-file-size">
              {formatFileSize(artifact.fileSize)}
            </span>
          </div>
        </div>
      </div>

      <a
        href={downloadUrl}
        download={artifact.fileName}
        data-testid="prd-download-btn"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink transition-all duration-150 hover:bg-paper active:scale-95"
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
