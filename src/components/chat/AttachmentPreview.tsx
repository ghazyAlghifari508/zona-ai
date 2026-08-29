import { Check, FileText, Loader2, TriangleAlert, X } from 'lucide-react'

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
            className="flex items-center gap-2 rounded-[10px] border border-hairline-mist bg-sandstone px-2 py-1 text-xs text-ink-black"
          >
            {a.uploading || status === 'pending' ? (
              <Loader2 size={14} className="animate-spin text-stone-deep" />
            ) : status === 'processing' ? (
              <Loader2 size={14} className="animate-spin text-stone-deep" />
            ) : isImage ? (
              <img
                src={`/api/attachments/${a.id}`}
                alt={a.fileName}
                className="h-10 w-10 rounded-[10px] object-cover"
              />
            ) : (
              <FileText
                size={16}
                strokeWidth={1.5}
                className="text-ink-black"
              />
            )}
            <span className="max-w-[100px] truncate text-[13px] font-medium">
              {a.fileName}
            </span>
            <span className="rounded-full bg-pure-white px-1.5 py-0.5 text-[10px] font-medium text-ink-black">
              {ext}
            </span>
            {a.fileSize !== undefined && (
              <span className="text-[10px] text-stone-deep">
                {(a.fileSize / 1024).toFixed(0)}KB
              </span>
            )}
            {status === 'pending' && (
              <span
                data-testid="attachment-status-pending"
                className="flex items-center gap-1 text-[11px] text-stone-deep"
              >
                <Loader2 size={12} className="animate-spin" />
                Uploading...
              </span>
            )}
            {status === 'processing' && (
              <span
                data-testid="attachment-status-processing"
                className="flex items-center gap-1 text-[11px] text-stone-deep"
              >
                <Loader2 size={12} className="animate-spin" />
                Indexing...
              </span>
            )}
            {status === 'completed' && (
              <span
                data-testid="attachment-status-completed"
                className="flex items-center gap-1 text-[11px] text-ink-black"
              >
                <Check size={12} strokeWidth={1.75} />
                Indexed
              </span>
            )}
            {status === 'failed' && (
              <span
                data-testid="attachment-status-failed"
                className="flex items-center gap-1 text-[11px] text-stone-deep"
              >
                <TriangleAlert size={12} strokeWidth={1.5} />
                Could not process
              </span>
            )}
            {status === 'failed' && onRetry && (
              <button
                type="button"
                data-testid="attachment-retry"
                onClick={() => onRetry(a.id)}
                className="rounded-full bg-pure-white px-2 py-0.5 text-[11px] font-medium text-ink-black hover:bg-cream-paper"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              data-testid="attachment-remove"
              onClick={() => onRemove(a.id)}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-pure-white text-ink-black hover:bg-cream-paper"
              aria-label={`Remove ${a.fileName}`}
            >
              <X size={12} strokeWidth={1.75} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
