import { TriangleAlert } from 'lucide-react'

type Props = {
  code?: string
  message: string
  onRetry?: () => void
}

/**
 * Inline error — White L1 surface, 10px radius, hairline border.
 * TriangleAlert Lucide icon (no emoji), Retry pill ghost button.
 */
export function InlineError({ code, message, onRetry }: Props) {
  return (
    <div
      data-testid="inline-error"
      role="note"
      className="flex items-center gap-2 rounded-[10px] border border-hairline-mist bg-pure-white p-3 text-sm text-ink-black"
    >
      <TriangleAlert
        size={16}
        strokeWidth={1.75}
        className="shrink-0 text-stone-gray"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        {code && <span className="mr-1 text-xs text-stone-gray">{code}</span>}
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto shrink-0 rounded-[10px] border border-ink-black bg-pure-white px-3 py-1 text-xs font-medium text-ink-black hover:bg-sandstone"
        >
          Retry
        </button>
      )}
    </div>
  )
}
