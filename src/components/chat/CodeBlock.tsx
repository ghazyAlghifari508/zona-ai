import { Check, Copy } from 'lucide-react'
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
    <div className="relative rounded-[10px] bg-sandstone p-4">
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 flex items-center gap-1 rounded-[10px] border border-hairline-mist bg-pure-white px-2 py-1 text-xs text-ink-black hover:bg-cream-paper"
      >
        {copied ? (
          <Check size={14} strokeWidth={1.75} />
        ) : (
          <Copy size={14} strokeWidth={1.75} />
        )}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="overflow-x-auto text-[14px] leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  )
}
