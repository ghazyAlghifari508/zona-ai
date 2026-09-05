import { Copy01Icon, Tick01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const COPIED_RESET_MS = 2000

type Props = {
  content: string
  onCopied?: (content: string) => void
  label?: boolean
  className?: string
  testId?: string
}

export function CopyButton({
  content,
  onCopied,
  label = false,
  className,
  testId = 'copy-button',
}: Props) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [])

  const handleCopy = async () => {
    if (!content) return
    if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      onCopied?.(content)
      timeoutRef.current = setTimeout(() => {
        setCopied(false)
        timeoutRef.current = null
      }, COPIED_RESET_MS)
    } catch {
      setCopied(false)
    }
  }

  return (
    <button
      type="button"
      data-testid={testId}
      data-state={copied ? 'copied' : 'idle'}
      onClick={() => void handleCopy()}
      aria-label={copied ? 'Tersalin' : 'Salin'}
      className={cn(
        'flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px]',
        copied ? 'text-ink' : 'text-stone',
        className,
      )}
    >
      <HugeiconsIcon
        icon={copied ? Tick01Icon : Copy01Icon}
        size={14}
        strokeWidth={1.75}
      />
      {label && (
        <span className="min-w-[46px] text-center">
          {copied ? 'Tersalin' : 'Salin'}
        </span>
      )}
    </button>
  )
}
