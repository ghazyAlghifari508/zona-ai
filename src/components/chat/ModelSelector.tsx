import { ChevronDown, Zap } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { ModelRegistryEntry } from '@/lib/models/types'
import { getModels } from '@/server/functions/models'

type Props = {
  value: string
  onChange: (id: string) => void
  credits?: number
}

export function ModelSelector({ value, onChange, credits = 100 }: Props) {
  const [models, setModels] = useState<ModelRegistryEntry[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getModels()
      .then((m) => setModels(m as ModelRegistryEntry[]))
      .catch(() => setModels([]))
  }, [])

  const selected =
    models.find((m) => m.id === value) ?? models.find((m) => m.isDefault)

  const costLabel = (m: ModelRegistryEntry) => {
    if (typeof m.creditCost === 'number') return `${m.creditCost}`
    return `${m.creditCost.min}-${m.creditCost.max}`
  }

  const isInsufficient = (m: ModelRegistryEntry) => {
    const cost =
      typeof m.creditCost === 'number' ? m.creditCost : m.creditCost.max
    return credits < cost
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="model-selector-trigger"
          className="flex items-center gap-2 rounded-full border border-hairline-mist bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink-black hover:bg-sandstone"
        >
          <span>{selected?.displayName ?? 'Auto (Smart Router)'}</span>
          {selected && (
            <span className="flex items-center gap-1 rounded-full bg-cream-paper px-2 py-0.5 text-xs">
              {costLabel(selected)} <Zap size={12} strokeWidth={1.75} />
            </span>
          )}
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            className="text-stone-deep"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[320px] rounded-[10px] border border-hairline-mist bg-pure-white p-2"
      >
        <div className="space-y-1">
          {models.map((m) => {
            const insufficient = isInsufficient(m)
            const cost =
              typeof m.creditCost === 'number' ? m.creditCost : m.creditCost.max
            return (
              <button
                key={m.id}
                type="button"
                data-testid={`model-option-${m.id}`}
                onClick={() => {
                  if (insufficient) return
                  onChange(m.id)
                  setOpen(false)
                }}
                disabled={insufficient}
                title={
                  insufficient ? `Butuh ${cost} (Sisa ${credits})` : undefined
                }
                className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2 text-left text-[14px] ${
                  m.id === value
                    ? 'bg-cream-paper border border-fresh-grass'
                    : 'hover:bg-sandstone border border-transparent'
                } ${insufficient ? 'opacity-50 cursor-not-allowed' : ''} ${m.id === 'auto' ? 'border-fresh-grass' : ''}`}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-ink-black">
                    {m.displayName}
                  </span>
                  <span className="text-xs text-stone-deep">
                    {m.provider} â€¢ {m.creditTier}
                  </span>
                </div>
                <span className="flex items-center gap-1 rounded-full bg-cream-paper px-2 py-1 text-xs font-medium">
                  {costLabel(m)} <Zap size={12} strokeWidth={1.75} />
                </span>
              </button>
            )
          })}
          {models.length === 0 && (
            <div className="p-3 text-sm text-stone-deep">Memuat model...</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
