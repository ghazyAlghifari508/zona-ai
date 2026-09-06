import {
  ArrowDown01Icon,
  ImageIcon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { ProviderIcon } from '@/components/ui/ProviderIcons'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  isCompareModelBlocked,
  isCompareSelectionValid,
  toggleCompareModel,
} from '@/lib/chat/compare-selection'
import { resolveModelFallback } from '@/lib/models/preference'
import { cn } from '@/lib/utils'
import { COMPARE_MAX_MODELS, COMPARE_MIN_MODELS } from '@/lib/utils/constants'
import { findCatalogEntry, useModelCatalog } from './useModelCatalog'

type Props = {
  value: string
  onChange: (id: string) => void
  credits?: number
  compareEnabled: boolean
  onCompareEnabledChange: (enabled: boolean) => void
  compareModelIds: string[]
  onCompareModelIdsChange: (ids: string[]) => void
}

export function ModelSelector({
  value,
  onChange,
  credits = 100,
  compareEnabled,
  onCompareEnabledChange,
  compareModelIds,
  onCompareModelIdsChange,
}: Props) {
  const catalog = useModelCatalog()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (catalog.length > 0 && value !== 'auto') {
      const resolved = resolveModelFallback(catalog, value)
      if (resolved !== value) {
        onChange(resolved)
      }
    }
  }, [catalog, value, onChange])

  const selectable = compareEnabled
    ? catalog.filter((m) => m.id !== 'auto')
    : catalog
  const selected = findCatalogEntry(catalog, value)

  const costLabel = (m: {
    creditCost: number | { min: number; max: number }
  }) =>
    typeof m.creditCost === 'number'
      ? `${m.creditCost}`
      : `${m.creditCost.min}-${m.creditCost.max}`

  const isInsufficient = (id: string) => {
    const m = catalog.find((x) => x.id === id)
    if (!m) return false
    const cost =
      typeof m.creditCost === 'number' ? m.creditCost : m.creditCost.max
    return credits < cost
  }

  const toggleCompare = () => {
    const next = !compareEnabled
    onCompareEnabledChange(next)
    if (!next) onCompareModelIdsChange([])
  }

  const toggleCompareModelById = (id: string) => {
    onCompareModelIdsChange(toggleCompareModel(compareModelIds, id))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="model-selector-trigger"
          aria-label="Pilih model"
          className="flex h-8 items-center gap-1.5 rounded-full border border-hairline bg-pure-white px-2.5 text-ink transition-all duration-200 hover:bg-ink/5 active:scale-95"
        >
          {compareEnabled && compareModelIds.length > 0 ? (
            <div
              data-testid="compare-stacked-icons"
              className="flex items-center -space-x-1.5"
            >
              {compareModelIds.map((id, index) => {
                const entry = findCatalogEntry(catalog, id)
                const provider = entry?.provider ?? 'zona-router'
                return (
                  <span
                    key={id}
                    data-testid={`stacked-icon-${id}`}
                    title={entry?.displayName ?? id}
                    style={{ zIndex: index + 1 }}
                    className="relative flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-pure-white bg-paper text-ink ring-1 ring-hairline"
                  >
                    <ProviderIcon provider={provider} size={12} />
                  </span>
                )
              })}
            </div>
          ) : (
            <span className="flex h-4 w-4 items-center justify-center text-ink">
              <ProviderIcon
                provider={selected?.provider ?? 'zona-router'}
                size={14}
              />
            </span>
          )}
          {compareEnabled ? (
            <span
              data-testid="compare-trigger-label"
              className="text-[13px] font-medium tracking-[-0.01em]"
            >
              {compareModelIds.length} model dipilih
            </span>
          ) : (
            <span className="text-[13px] font-medium tracking-[-0.01em]">
              {selected?.displayName ??
                (catalog.length === 0 ? 'Memuat…' : 'Auto')}
            </span>
          )}
          {selected && !compareEnabled && (
            <span className="rounded-full bg-sky-tint px-1.5 py-0.5 text-[10px] font-semibold text-midnight">
              {costLabel(selected)}
            </span>
          )}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={13}
            strokeWidth={1.75}
            className="text-ink/40"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[340px] rounded-lg border border-hairline bg-pure-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-[10px] font-bold tracking-[0.11em] text-ink/40 uppercase">
            {compareEnabled
              ? 'PILIH ' +
                COMPARE_MIN_MODELS +
                '–' +
                COMPARE_MAX_MODELS +
                ' MODEL'
              : 'PILIH MODEL AI'}
          </span>
          {compareEnabled && (
            <span
              data-testid="compare-counter"
              className={cn(
                'text-xs font-bold',
                isCompareSelectionValid(compareModelIds)
                  ? 'text-ink'
                  : 'text-coral',
              )}
            >
              {compareModelIds.length}/{COMPARE_MAX_MODELS}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between rounded-md bg-paper px-3 py-2">
          <span className="text-[13px] font-medium text-ink">Bandingkan</span>
          <button
            type="button"
            role="switch"
            aria-checked={compareEnabled}
            data-testid="compare-switch"
            onClick={toggleCompare}
            className={cn(
              'relative h-5 w-9 rounded-full transition-colors duration-200',
              compareEnabled ? 'bg-notion-blue' : 'bg-hairline-strong',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-pure-white transition-transform duration-200',
                compareEnabled ? 'translate-x-4' : 'translate-x-0',
              )}
            />
          </button>
        </div>
        <div className="mt-2 max-h-[380px] space-y-1 overflow-y-auto pr-0.5">
          {selectable.map((m) => {
            const isSelected = compareEnabled
              ? compareModelIds.includes(m.id)
              : m.id === value
            const insufficient = isInsufficient(m.id)
            const blocked =
              insufficient ||
              (compareEnabled && isCompareModelBlocked(compareModelIds, m.id))
            return (
              <button
                key={m.id}
                type="button"
                data-testid={`model-option-${m.id}`}
                onClick={() => {
                  if (blocked) return
                  if (compareEnabled) toggleCompareModelById(m.id)
                  else {
                    onChange(m.id)
                    setOpen(false)
                  }
                }}
                disabled={blocked}
                title={
                  insufficient
                    ? `Butuh ${typeof m.creditCost === 'number' ? m.creditCost : m.creditCost.max} (Sisa ${credits})`
                    : undefined
                }
                className={cn(
                  'flex w-full gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-200',
                  m.id === 'auto' ? 'items-start' : 'items-center',
                  isSelected ? 'bg-paper' : 'hover:bg-ink/5',
                  blocked && 'cursor-not-allowed opacity-50',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border',
                    m.id === 'auto'
                      ? 'mt-0.5 border-ink bg-ink'
                      : 'border-hairline bg-pure-white text-ink',
                  )}
                >
                  <ProviderIcon
                    provider={m.provider}
                    size={19}
                    inverted={m.id === 'auto'}
                  />
                </span>
                <span className="flex-1 overflow-hidden">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-bold tracking-[-0.015em] text-ink">
                      {m.displayName}
                    </span>
                    <span className="shrink-0 rounded-full bg-paper px-1.5 py-0.5 text-[10.5px] text-stone">
                      {m.vendor}
                    </span>
                    {m.creditTier === 'premium' && (
                      <span className="shrink-0 rounded-full bg-sky-tint px-1.5 py-0.5 text-[10.5px] font-semibold text-midnight">
                        Premium
                      </span>
                    )}
                  </span>
                  {m.id === 'auto' && (
                    <p className="mt-0.5 text-[11.5px] leading-[1.3] text-stone">
                      Pilih model otomatis sesuai bobot tugas.
                    </p>
                  )}
                  <span className="mt-0.5 flex items-center gap-1.5">
                    {m.id !== 'auto' && (
                      <span
                        className="flex items-end gap-[2.5px]"
                        title={`Tingkat kecerdasan ${m.intelligenceBars ?? m.intelligenceLevel}/4 (Skor: ${m.intelligenceScore ?? m.intelligenceLevel * 25}/100)`}
                      >
                        {[1, 2, 3, 4].map((slot) => {
                          const level =
                            m.intelligenceBars ?? m.intelligenceLevel
                          return (
                            <span
                              key={slot}
                              className="w-1 rounded-[1.5px]"
                              style={{
                                height: 11,
                                background:
                                  slot <= level
                                    ? level === 4
                                      ? 'var(--color-coral)'
                                      : level === 3
                                        ? 'var(--color-marigold)'
                                        : 'var(--color-sky-wash)'
                                    : 'var(--color-hairline-strong)',
                              }}
                            />
                          )
                        })}
                      </span>
                    )}
                    {m.id !== 'auto' && m.capabilities.vision && (
                      <span
                        className="flex items-center gap-1 text-[11.5px] text-stone"
                        title="Mendukung input gambar (vision)"
                      >
                        <HugeiconsIcon
                          icon={ImageIcon}
                          size={12}
                          strokeWidth={1.5}
                        />
                        Vision
                      </span>
                    )}
                  </span>
                </span>
                {compareEnabled ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150',
                      m.id === 'auto' && 'mt-1',
                      isSelected
                        ? 'border-notion-blue bg-notion-blue'
                        : 'border-hairline-strong bg-pure-white',
                    )}
                  >
                    {isSelected && (
                      <HugeiconsIcon
                        icon={Tick01Icon}
                        size={12}
                        strokeWidth={2.25}
                        className="text-pure-white"
                      />
                    )}
                  </span>
                ) : (
                  isSelected && (
                    <HugeiconsIcon
                      icon={Tick01Icon}
                      size={16}
                      strokeWidth={1.75}
                      className={cn(
                        'shrink-0 text-notion-blue',
                        m.id === 'auto' && 'mt-1',
                      )}
                    />
                  )
                )}
              </button>
            )
          })}
          {selectable.length === 0 && (
            <div className="p-3 text-sm text-stone">Memuat model...</div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
