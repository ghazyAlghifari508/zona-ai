import { ChevronDown, X, Zap } from "lucide-react"
import { useEffect, useState } from "react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { ModelRegistryEntry } from "@/lib/models/types"
import { getModels } from "@/server/functions/models"
import { COMPARE_MAX_MODELS } from "@/lib/utils/constants"

type Props = {
  value: string[]
  onChange: (ids: string[]) => void
  credits?: number
}

export function CompareSelector({ value, onChange, credits = 100 }: Props) {
  const [models, setModels] = useState<ModelRegistryEntry[]>([])
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getModels()
      .then((m) => setModels(m as ModelRegistryEntry[]))
      .catch(() => setModels([]))
  }, [])

  const toggle = (id: string) => {
    if (value.includes(id)) {
      onChange(value.filter((v) => v !== id))
    } else {
      if (value.length >= COMPARE_MAX_MODELS) return
      onChange([...value, id])
    }
  }

  const total = value.reduce((sum, id) => {
    const m = models.find((x) => x.id === id)
    if (!m) return sum
    const cost = typeof m.creditCost === "number" ? m.creditCost : m.creditCost.max
    return sum + cost
  }, 0)

  const insufficient = credits < total

  const costLabel = (m: ModelRegistryEntry) => {
    if (typeof m.creditCost === "number") return `${m.creditCost}`
    return `${m.creditCost.max}`
  }

  const isInsufficientForModel = (m: ModelRegistryEntry) => {
    const cost = typeof m.creditCost === "number" ? m.creditCost : m.creditCost.max
    return credits < cost
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="compare-selector-btn"
          className="flex items-center gap-2 rounded-full border border-hairline-mist bg-pure-white px-3 py-1.5 text-[13px] font-medium text-ink-black hover:bg-sandstone"
        >
          <span>
            {value.length ? `${value.length} model terpilih` : "Pilih model"}
          </span>
          <ChevronDown size={14} strokeWidth={1.75} className="text-stone-gray" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] rounded-[10px] border border-hairline-mist bg-pure-white p-3">
        <div className="text-[11px] uppercase tracking-wide text-stone-gray">Pilih 2-4 Model</div>

        {value.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {value.map((id) => {
              const m = models.find((x) => x.id === id)
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-[10px] bg-sandstone px-2 py-1 text-xs font-medium text-ink-black"
                >
                  {m?.displayName ?? id}
                  <button type="button" onClick={() => toggle(id)} className="ml-1">
                    <X size={12} strokeWidth={1.75} />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <div className="mt-3 max-h-60 space-y-1 overflow-auto">
          {models.map((m) => {
            const isAuto = m.id === "auto"
            const checked = value.includes(m.id)
            const insufficientModel = isInsufficientForModel(m)
            return (
              <label
                key={m.id}
                className={`flex items-center gap-2 rounded-[10px] px-3 py-2 text-left text-[14px] border ${
                  checked ? "bg-cream-paper border-fresh-grass" : "hover:bg-sandstone border-transparent"
                } ${isAuto ? "opacity-60 cursor-not-allowed" : ""}`}
                title={isAuto ? "Auto tidak tersedia di Compare" : insufficientModel ? `Butuh ${costLabel(m)} (Sisa ${credits})` : undefined}
              >
                <input
                  type="checkbox"
                  disabled={isAuto}
                  checked={checked}
                  onChange={() => {
                    if (isAuto) return
                    toggle(m.id)
                  }}
                  data-testid={`compare-option-${m.id}`}
                />
                <span className="flex-1">
                  <span className="font-medium text-ink-black">{m.displayName}</span>
                  <span className="ml-2 text-xs text-stone-gray">
                    {m.provider} • {m.creditTier}
                  </span>
                </span>
                <span className="flex items-center gap-1 rounded-full bg-cream-paper px-2 py-1 text-xs font-medium">
                  {costLabel(m)} <Zap size={12} strokeWidth={1.75} />
                </span>
              </label>
            )
          })}
          {models.length === 0 && <div className="p-3 text-sm text-stone-gray">Memuat model...</div>}
          {/* Also render Auto explicitly disabled if not in models list? Already included */}
          {models.find((m) => m.id === "auto") && (
            <div className="px-3 py-1 text-[11px] text-stone-gray">Auto (Smart Router) tidak tersedia di Compare</div>
          )}
        </div>

        <div data-testid="compare-total" className="mt-3 flex items-center justify-between text-sm">
          <span>Total: {total} Kredit</span>
          <span className={insufficient ? "text-stone-gray" : "text-stone-gray"}>Sisa: {credits}</span>
        </div>
        {insufficient && <div className="mt-1 text-xs text-stone-gray">Butuh {total} (Sisa {credits})</div>}
        {value.length < 2 && <div className="mt-1 text-xs text-stone-gray">Pilih minimal 2 model</div>}
        {value.length > 4 && <div className="mt-1 text-xs text-stone-gray">Maksimal 4 model</div>}

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={value.length < 2 || value.length > 4 || insufficient}
            onClick={() => setOpen(false)}
            className="rounded-full border border-ink-black bg-ink-black px-4 py-1.5 text-sm font-medium text-pure-white hover:bg-stone-gray disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Bandingkan
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
