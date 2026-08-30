import { Alert02Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'

type Props = {
  code?: string
  message: string
  onRetry?: () => void
}

/**
 * Inline error — Notion style coral tint.
 */
export function InlineError({ code, message, onRetry }: Props) {
  return (
    <div
      data-testid="inline-error"
      role="note"
      className="flex items-center gap-2 rounded-md border border-coral/30 bg-[#fff0e8] px-3 py-2 text-[13px] text-ink"
    >
      <HugeiconsIcon
        icon={Alert02Icon}
        size={16}
        strokeWidth={1.75}
        className="shrink-0 text-coral"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        {code && <span className="mr-1 text-xs text-stone">{code}</span>}
        {message}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto shrink-0 rounded-md px-3 py-1 text-xs font-medium text-notion-blue hover:bg-ink/5"
        >
          Retry
        </button>
      )}
    </div>
  )
}
