import { Copy01Icon, Tick01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

export function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <div className="relative max-w-full rounded-lg border border-hairline bg-pure-white p-4">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 flex items-center gap-1 rounded-md border border-hairline bg-pure-white px-2 py-1 text-xs text-ink hover:bg-ink/5"
      >
        {copied ? (
          <HugeiconsIcon icon={Tick01Icon} size={14} strokeWidth={1.75} />
        ) : (
          <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
        )}
        {copied ? 'Tersalin' : 'Salin'}
      </button>
      <pre className="overflow-x-auto text-[14px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}
