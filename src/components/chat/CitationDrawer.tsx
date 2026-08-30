import { ArrowDown01Icon, Link04Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'

export type CitationSource = {
  url: string
  title: string | null
  snippet: string | null
  position: number
  score?: number | null
}

type Props = {
  sources: CitationSource[]
}

export function CitationDrawer({ sources }: Props) {
  const [open, setOpen] = useState(true)
  if (!sources.length) return null
  const sorted = [...sources].sort((a, b) => a.position - b.position)
  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-1">
        {sorted.map((s) => (
          <a
            key={s.position}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-hairline bg-paper px-2 py-1 text-xs text-stone hover:bg-pure-white hover:text-ink"
            data-testid={`citation-chip-${s.position}`}
          >
            [{s.position + 1}]
          </a>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-1 text-[12px] text-stone hover:text-ink"
          data-testid="citation-toggle"
        >
          Sources ({sources.length})
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={12}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {open && (
        <div
          className="mt-2 space-y-2 rounded-lg border border-hairline bg-pure-white p-3"
          data-testid="citation-drawer"
        >
          {sorted.map((s) => (
            <a
              key={s.position}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-2 rounded-md p-2 hover:bg-paper"
              data-testid={`citation-row-${s.position}`}
            >
              <span className="flex h-6 shrink-0 items-center justify-center rounded-full bg-paper px-2 text-xs font-medium text-ink">
                [{s.position + 1}]
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium text-ink">
                  {s.title ?? s.url}
                </div>
                <div className="truncate text-[13px] text-stone">{s.url}</div>
                {s.snippet && (
                  <div className="line-clamp-2 text-sm text-stone">
                    {s.snippet}
                  </div>
                )}
              </div>
              <HugeiconsIcon
                icon={Link04Icon}
                size={12}
                className="shrink-0 text-stone"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
