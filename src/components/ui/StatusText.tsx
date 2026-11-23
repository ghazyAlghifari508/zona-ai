import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Props = {
  children: ReactNode
  tone?: 'neutral' | 'danger' | 'accent'
  className?: string
}

export function StatusText({ children, tone = 'neutral', className }: Props) {
  return (
    <span
      className={cn(
        'text-[12px] leading-snug font-medium',
        tone === 'danger'
          ? 'text-coral'
          : tone === 'accent'
            ? 'text-notion-blue'
            : 'text-stone',
        className,
      )}
    >
      {children}
    </span>
  )
}
