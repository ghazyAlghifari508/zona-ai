import {
  ArrowDown01Icon,
  ImageIcon,
  Search01Icon,
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
import { filterModelCatalogEntry } from '@/lib/models/filter'
import { resolveModelFallback } from '@/lib/models/preference'
import {
  formatCreditCost,
  getModelAvailability,
  getModelRouteLabel,
  hasVerifiedVision,
} from '@/lib/models/presentation'
import type { ModelCatalogEntry } from '@/lib/models/types'
import { cn } from '@/lib/utils'
import { COMPARE_MAX_MODELS, COMPARE_MIN_MODELS } from '@/lib/utils/constants'
import { findCatalogEntry, useModelCatalog } from './useModelCatalog'

const VENDOR_ORDER = [
  'OpenAI',
  'Google',
  'Anthropic',
  'xAI',
  'DeepSeek',
  'Meta',
  'Shanghai AI Lab',
  'Qwen',
  'Xiaomi',
  'Tencent',
  'Zhipu AI',
]

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
  const [searchQuery, setSearchQuery] = useState('')

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      setSearchQuery('')
    }
  }

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
    }
  }, [open])

  useEffect(() => {
    if (catalog.length > 0 && value !== 'auto') {
      const resolved = resolveModelFallback(catalog, value)
      if (resolved !== value) {
        onChange(resolved)
      }
    }
  }, [catalog, value, onChange])

  const hiddenFromSelector = (m: ModelCatalogEntry) =>
    m.status === 'retired' ||
    m.evaluationStatus === 'pending' ||
    m.evaluationStatus === 'failed' ||
    m.evaluationStatus === 'inconclusive' ||
    m.creditCost === null

  const visible = catalog.filter((m) => !hiddenFromSelector(m))
  const filteredVisible = (
    searchQuery.trim()
      ? visible.filter((m) => filterModelCatalogEntry(m, searchQuery))
      : visible
  ).filter((m) => !compareEnabled || !m.isDefault)
  const selected = findCatalogEntry(catalog, value)
  const selectedAvailability = selected ? getModelAvailability(selected) : null

  const isInsufficient = (id: string) => {
    const m = findCatalogEntry(catalog, id)
    if (!m) return false
    const cost =
      m.creditCost === null
        ? 0
        : typeof m.creditCost === 'number'
          ? m.creditCost
          : m.creditCost.max
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

  const autoModel = filteredVisible.find((m) => m.id === 'auto')
  const nonAutoModels = filteredVisible.filter((m) => m.id !== 'auto')

  const groupedModels = nonAutoModels.reduce<
    Record<string, ModelCatalogEntry[]>
  >((acc, model) => {
    const vendor = model.vendor || 'Lainnya'
    if (!acc[vendor]) acc[vendor] = []
    acc[vendor].push(model)
    return acc
  }, {})

  const sortedVendors = Object.keys(groupedModels).sort((a, b) => {
    const indexA = VENDOR_ORDER.indexOf(a)
    const indexB = VENDOR_ORDER.indexOf(b)
    if (indexA !== -1 && indexB !== -1) return indexA - indexB
    if (indexA !== -1) return -1
    if (indexB !== -1) return 1
    return a.localeCompare(b)
  })

  for (const vendor of sortedVendors) {
    groupedModels[vendor].sort(
      (a, b) => (b.intelligenceScore ?? 0) - (a.intelligenceScore ?? 0),
    )
  }

  const renderModelOption = (m: ModelCatalogEntry) => {
    const isSelected = compareEnabled
      ? compareModelIds.includes(m.id)
      : m.id === value
    const availability = getModelAvailability(m)
    const insufficient = isInsufficient(m.id)
    const blocked =
      !availability.selectable ||
      insufficient ||
      (compareEnabled && isCompareModelBlocked(compareModelIds, m.id))
    const shortId = m.id.includes('/') ? m.id.split('/')[1] : null
    const routeLabel = getModelRouteLabel(m, catalog)
    const costLabel = formatCreditCost(m.creditCost)
    const accessibleName = [
      m.displayName,
      routeLabel,
      availability.label,
      availability.reason,
      costLabel,
    ]
      .filter(Boolean)
      .join(' — ')

    return (
      <button
        key={m.id}
        type="button"
        data-testid={`model-option-${m.id}`}
        data-model-id={m.id}
        aria-label={accessibleName}
        aria-disabled={blocked}
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
          availability.state === 'inactive'
            ? (availability.reason ?? availability.label)
            : insufficient
              ? `Butuh ${m.creditCost === null ? 0 : typeof m.creditCost === 'number' ? m.creditCost : m.creditCost.max} (Sisa ${credits})`
              : undefined
        }
        className={cn(
          'relative flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-200',
          blocked && 'cursor-not-allowed opacity-50',
        )}
      >
        {shortId && (
          <span
            className="sr-only pointer-events-none"
            data-testid={`model-option-${shortId}`}
          />
        )}
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
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug font-bold tracking-[-0.015em] text-ink break-words">
            {m.displayName}
          </span>
          {m.id === 'auto' && (
            <span className="mt-0.5 block text-[11.5px] leading-[1.3] text-stone">
              Pilih model otomatis sesuai bobot tugas.
            </span>
          )}
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] leading-[1.4] text-stone">
            {m.id !== 'auto' && availability.state === 'ready' && (
              <span
                className="flex items-end gap-[2.5px]"
                title={`Tingkat kecerdasan ${m.intelligenceBars ?? m.intelligenceLevel}/4 (Skor: ${m.intelligenceScore ?? m.intelligenceLevel * 25}/100)`}
              >
                {[1, 2, 3, 4].map((slot) => {
                  const level = m.intelligenceBars ?? m.intelligenceLevel
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
            {m.id !== 'auto' && hasVerifiedVision(m) && (
              <span
                className="flex items-center gap-1"
                title="Mendukung input gambar (vision)"
              >
                <HugeiconsIcon icon={ImageIcon} size={12} strokeWidth={1.5} />
                Vision
              </span>
            )}
            {routeLabel && <span>{routeLabel}</span>}
            {costLabel && <span>{costLabel}</span>}
            {availability.state !== 'ready' && (
              <span
                data-testid={
                  availability.state === 'inactive'
                    ? `model-disabled-badge-${m.id}`
                    : undefined
                }
              >
                {availability.label}
              </span>
            )}
          </span>
          {availability.reason && (
            <span
              className="mt-0.5 block text-[11.5px] leading-[1.4] text-stone break-words"
              title={availability.reason}
            >
              {availability.reason}
            </span>
          )}
        </span>
        {compareEnabled ? (
          <span
            aria-hidden="true"
            className={cn(
              'mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150',
              isSelected
                ? 'border-accent bg-accent'
                : 'border-hairline-strong bg-pure-white',
            )}
          >
            {isSelected && (
              <HugeiconsIcon
                icon={Tick01Icon}
                size={12}
                strokeWidth={2.25}
                className="text-white"
              />
            )}
          </span>
        ) : (
          isSelected && (
            <HugeiconsIcon
              icon={Tick01Icon}
              size={16}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-notion-blue"
            />
          )
        )}
      </button>
    )
  }

  return (
    <div className="min-w-0 shrink-0">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            data-testid="model-selector-trigger"
            aria-label={
              compareEnabled
                ? `Pilih model, ${compareModelIds.length} dipilih`
                : `Pilih model: ${selected?.displayName ?? 'Auto'}${selectedAvailability && selectedAvailability.state !== 'ready' ? `, ${selectedAvailability.label}` : ''}`
            }
            className="flex h-8 shrink-0 items-center gap-1 sm:gap-1.5 rounded-full border border-hairline bg-pure-white px-2 sm:px-2.5 text-ink transition-all duration-200 hover:bg-ink/5 active:scale-95 min-w-0 max-w-[140px] sm:max-w-[220px]"
          >
            {compareEnabled && compareModelIds.length > 0 ? (
              <div
                data-testid="compare-stacked-icons"
                className="flex shrink-0 items-center -space-x-1.5"
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
              <span className="flex h-4 w-4 shrink-0 items-center justify-center text-ink">
                <ProviderIcon
                  provider={selected?.provider ?? 'zona-router'}
                  size={14}
                />
              </span>
            )}
            {compareEnabled ? (
              <span
                data-testid="compare-trigger-label"
                className="truncate text-[12px] sm:text-[13px] font-medium tracking-[-0.01em]"
              >
                {compareModelIds.length} model dipilih
              </span>
            ) : (
              <span className="truncate text-[12px] sm:text-[13px] font-medium tracking-[-0.01em]">
                {selected?.displayName ??
                  (catalog.length === 0 ? 'Memuat...' : 'Auto')}
              </span>
            )}
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={13}
              strokeWidth={1.75}
              className="shrink-0 text-ink/40"
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
                ? `PILIH ${COMPARE_MIN_MODELS}-${COMPARE_MAX_MODELS} MODEL`
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
                compareEnabled ? 'bg-accent' : 'bg-hairline-strong',
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
          <label className="relative mt-2 block">
            <span className="sr-only">Cari model</span>
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone"
              aria-hidden="true"
            />
            <input
              type="search"
              data-testid="model-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari model..."
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-md border border-hairline bg-paper/50 py-1.5 pl-8 pr-2.5 text-[12.5px] text-ink outline-none placeholder:text-stone transition-colors duration-150 focus:border-notion-blue focus:bg-pure-white"
            />
          </label>
          <div className="mt-2 max-h-[380px] space-y-2.5 overflow-y-auto pr-0.5">
            {autoModel && (
              <div className="space-y-1">
                {!compareEnabled && (
                  <div className="px-2.5 py-0.5 text-[10px] font-bold tracking-[0.08em] text-ink/40 uppercase">
                    Smart Router
                  </div>
                )}
                {renderModelOption(autoModel)}
              </div>
            )}

            {sortedVendors.map((vendor) => (
              <div
                key={vendor}
                data-testid={`vendor-group-${vendor.toLowerCase().replace(/[^a-z0-9]/g, '-')}`}
                className="space-y-1"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between border-b border-hairline/60 bg-pure-white/95 px-2.5 py-1 backdrop-blur-[2px]">
                  <span className="text-[10px] font-bold tracking-[0.08em] text-ink/40 uppercase">
                    {vendor}
                  </span>
                  <span className="text-[10px] font-semibold text-stone">
                    {groupedModels[vendor].length}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {groupedModels[vendor].map(renderModelOption)}
                </div>
              </div>
            ))}

            {catalog.length === 0 ? (
              <div className="p-3 text-sm text-stone">Memuat model...</div>
            ) : !autoModel && sortedVendors.length === 0 ? (
              <div
                data-testid="model-search-empty"
                className="py-6 text-center text-xs text-stone"
              >
                Tidak ada model ditemukan.
              </div>
            ) : null}
          </div>
        </PopoverContent>
      </Popover>
      {!compareEnabled &&
        selectedAvailability &&
        selectedAvailability.state !== 'ready' && (
          <p
            data-testid="model-selector-unavailable"
            role="status"
            className="mt-1 px-1 text-[11.5px] leading-snug text-coral break-words"
          >
            {selectedAvailability.label}. Pilih model lain sebelum mengirim.
            {selectedAvailability.reason
              ? ` ${selectedAvailability.reason}`
              : ''}
          </p>
        )}
    </div>
  )
}
