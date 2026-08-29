import { ChevronDown, ExternalLink } from 'lucide-react'
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
            className="rounded-[10px] border border-hairline-mist bg-sandstone px-2 py-1 text-xs text-ink-black hover:bg-pure-white"
            data-testid={`citation-chip-${s.position}`}
          >
            [{s.position + 1}]
          </a>
        ))}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-stone-gray"
          data-testid="citation-toggle"
        >
          Sources ({sources.length})
          <ChevronDown
            size={12}
            className={`transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>
      {open && (
        <div
          className="mt-2 space-y-2 rounded-[10px] border border-hairline-mist bg-pure-white p-3"
          data-testid="citation-drawer"
        >
          {sorted.map((s) => (
            <a
              key={s.position}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-2 rounded-[10px] p-2 hover:bg-sandstone"
              data-testid={`citation-row-${s.position}`}
            >
              <span className="flex h-6 shrink-0 items-center justify-center rounded-full bg-sandstone px-2 text-xs font-medium text-ink-black">
                [{s.position + 1}]
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-medium text-ink-black">
                  {s.title ?? s.url}
                </div>
                <div className="truncate text-[13px] text-stone-gray">
                  {s.url}
                </div>
                {s.snippet && (
                  <div className="line-clamp-2 text-sm text-stone-gray">
                    {s.snippet}
                  </div>
                )}
              </div>
              <ExternalLink size={12} className="shrink-0 text-stone-gray" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
