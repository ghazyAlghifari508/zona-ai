import type { ReactNode } from 'react'
import { extractRawText } from '@/lib/chat/syntax-highlight'
import { CopyButton } from './CopyButton'

export interface CodeBlockProps {
  children: ReactNode
  className?: string
  rawCode?: string
}

export function CodeBlock({ children, className, rawCode }: CodeBlockProps) {
  const codeContent = rawCode ?? extractRawText(children)

  return (
    <div className="relative max-w-full rounded-lg border border-hairline bg-pure-white p-4">
      <CopyButton
        content={codeContent}
        label
        testId="codeblock-copy"
        className="absolute top-2 right-2 min-h-0 rounded-md border border-hairline bg-pure-white px-2 py-1 text-xs text-ink"
      />
      <pre className="overflow-x-auto text-[14px] leading-relaxed">
        <code className={className}>{children}</code>
      </pre>
    </div>
  )
}
