import {
  Alert02Icon,
  Cancel01Icon,
  File01Icon,
  Loading03Icon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

export type PreviewAttachment = {
  id: string
  fileName: string
  mimeType: string
  fileSize?: number
  uploading?: boolean
  processingStatus?: string
}

type Props = {
  attachments: PreviewAttachment[]
  onRemove: (id: string) => void
  onRetry?: (id: string) => void
}

export function AttachmentPreview({ attachments, onRemove, onRetry }: Props) {
  if (attachments.length === 0) return null

  return (
    <div data-testid="attachment-preview" className="flex flex-wrap gap-2 p-2">
      {attachments.map((a) => {
        const isImage = a.mimeType.startsWith('image/')
        const ext =
          a.fileName.split('.').pop() ?? a.mimeType.split('/')[1] ?? ''
        const status =
          a.processingStatus ?? (a.uploading ? 'pending' : undefined)
        return (
          <div
            key={a.id}
            data-testid="attachment-item"
            className="flex items-center gap-2 rounded-md border border-hairline bg-pure-white px-2 py-1 text-xs text-ink"
          >
            {a.uploading || status === 'pending' ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={14}
                className="animate-spin text-notion-blue"
              />
            ) : status === 'processing' ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={14}
                className="animate-spin text-notion-blue"
              />
            ) : isImage ? (
              <img
                src={`/api/attachments/${a.id}`}
                alt={a.fileName}
                className="h-10 w-10 rounded-md object-cover"
              />
            ) : (
              <HugeiconsIcon
                icon={File01Icon}
                size={16}
                strokeWidth={1.5}
                className="text-stone"
              />
            )}
            <span className="max-w-[100px] truncate text-[13px] font-medium">
              {a.fileName}
            </span>
            <span className="rounded-full bg-paper px-1.5 py-0.5 text-[10px] font-medium text-stone">
              {ext}
            </span>
            {a.fileSize !== undefined && (
              <span className="text-[10px] text-stone">
                {(a.fileSize / 1024).toFixed(0)}KB
              </span>
            )}
            {status === 'pending' && (
              <span
                data-testid="attachment-status-pending"
                className="flex items-center gap-1 rounded-full bg-sky-tint px-2 py-0.5 text-[11px] font-medium text-notion-blue"
              >
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={12}
                  className="animate-spin"
                />
                Uploading...
              </span>
            )}
            {status === 'processing' && (
              <span
                data-testid="attachment-status-processing"
                className="flex items-center gap-1 rounded-full bg-sky-tint px-2 py-0.5 text-[11px] font-medium text-notion-blue"
              >
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={12}
                  className="animate-spin"
                />
                Indexing...
              </span>
            )}
            {status === 'completed' && (
              <span
                data-testid="attachment-status-completed"
                className="flex items-center gap-1 rounded-full bg-sky-tint px-2 py-0.5 text-[11px] font-medium text-notion-blue"
              >
                <HugeiconsIcon icon={Tick01Icon} size={12} strokeWidth={1.75} />
                Indexed
              </span>
            )}
            {status === 'failed' && (
              <span
                data-testid="attachment-status-failed"
                className="flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-medium text-coral"
              >
                <HugeiconsIcon icon={Alert02Icon} size={12} strokeWidth={1.5} />
                Could not process
              </span>
            )}
            {status === 'failed' && onRetry && (
              <button
                type="button"
                data-testid="attachment-retry"
                onClick={() => onRetry(a.id)}
                className="rounded-full bg-pure-white px-2 py-0.5 text-[11px] font-medium text-notion-blue hover:bg-ink/5"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              data-testid="attachment-remove"
              onClick={() => onRemove(a.id)}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-pure-white text-stone hover:bg-ink/5 hover:text-ink"
              aria-label={`Remove ${a.fileName}`}
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.75} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
