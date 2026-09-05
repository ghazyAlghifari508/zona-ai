import { ArrowDown01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useId, useState } from 'react'

type Props = {
  content: string | null | undefined
}

const hasContent = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0

export function ReasoningSection({ content }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()

  if (!hasContent(content)) return null

  return (
    <div className="mb-4" data-testid="reasoning-section">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        data-testid="reasoning-toggle"
        className="-ml-1.5 inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium text-stone transition-colors duration-200 hover:bg-ink/5 hover:text-ink"
      >
        Reasoning
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          size={14}
          strokeWidth={1.75}
          aria-hidden="true"
          className={`pointer-events-none transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          id={panelId}
          data-testid="reasoning-panel"
          className="reasoning-scroll mt-1.5 max-h-64 overflow-y-auto rounded-md bg-paper px-3 py-2.5"
        >
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-graphite [overflow-wrap:anywhere]">
            {content}
          </p>
        </div>
      )}
    </div>
  )
}
