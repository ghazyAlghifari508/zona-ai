import {
  Alert02Icon,
  ArrowDown01Icon,
  Copy01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

type Props = {
  code?: string
  message: string
  onRetry?: () => void
  technicalDetail?: string | null
}

export function InlineError({
  code,
  message,
  onRetry,
  technicalDetail,
}: Props) {
  const [showDetail, setShowDetail] = useState(false)

  return (
    <div
      data-testid="inline-error"
      role="note"
      className="min-w-0 rounded-md border border-coral/30 bg-[#fff0e8] px-3 py-2 text-[13px] text-ink"
    >
      <div className="flex items-center gap-2">
        <HugeiconsIcon
          icon={Alert02Icon}
          size={16}
          strokeWidth={1.75}
          className="shrink-0 text-coral"
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
          {code && <span className="mr-1 text-xs text-stone">{code}</span>}
          {message}
        </span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            data-testid="inline-error-retry"
            className="ml-auto shrink-0 rounded-md px-3 py-1 text-xs font-medium text-notion-blue hover:bg-ink/5"
          >
            Coba lagi
          </button>
        )}
      </div>
      {technicalDetail && (
        <div className="mt-1.5 min-w-0 border-t border-coral/20 pt-1.5">
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
            data-testid="error-detail-toggle"
            className="flex items-center gap-1 text-xs text-stone hover:text-ink"
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={12}
              strokeWidth={1.75}
              aria-hidden="true"
              className={showDetail ? 'rotate-180' : undefined}
            />
            Detail error
          </button>
          {showDetail && (
            <div className="relative mt-1 min-w-0">
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded bg-paper px-2 py-1.5 pr-7 text-[11px] leading-relaxed text-stone [overflow-wrap:anywhere]">
                {technicalDetail}
              </pre>
              <button
                type="button"
                onClick={() =>
                  void navigator.clipboard.writeText(technicalDetail)
                }
                aria-label="Salin detail error"
                className="absolute right-1 top-1 flex h-6 w-6 cursor-pointer items-center justify-center rounded text-stone"
              >
                <HugeiconsIcon
                  icon={Copy01Icon}
                  size={12}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
