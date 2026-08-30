'use client'

import { Alert02Icon, Cancel01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect } from 'react'

type Props = {
  message: string
  code?: string
  onClose?: () => void
  durationMs?: number
}

/**
 * Error toast — Ink Black surface, Pure White text, 10px radius,
 * fixed bottom-right, transient. Lucide icon only (no emoji).
 */
export function ErrorToast({
  message,
  code,
  onClose,
  durationMs = 5000,
}: Props) {
  useEffect(() => {
    if (!onClose) return
    const timer = window.setTimeout(onClose, durationMs)
    return () => window.clearTimeout(timer)
  }, [onClose, durationMs])

  return (
    <div
      role="status"
      data-testid="error-toast"
      className="fixed right-6 bottom-6 z-50 flex max-w-[360px] items-start gap-2 rounded-lg border border-hairline bg-pure-white p-3 text-sm text-ink"
    >
      <HugeiconsIcon
        icon={Alert02Icon}
        size={16}
        strokeWidth={1.75}
        className="mt-0.5 shrink-0"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        {code && <span className="mr-1 text-xs opacity-70">{code}</span>}
        {message}
      </span>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup notifikasi"
          className="shrink-0 rounded-[10px] p-0.5 hover:opacity-70"
        >
          <HugeiconsIcon
            icon={Cancel01Icon}
            size={14}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  )
}
