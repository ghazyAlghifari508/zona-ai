import {
  Alert01Icon,
  CheckmarkCircle02Icon,
  CpuIcon,
  Loading03Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { modelRegistry } from '../../lib/models/registry'
import {
  getModelSettingsFn,
  updateModelAvailabilityFn,
} from '../../server/functions/admin-models'

export const Route = createFileRoute('/admin/models')({
  loader: async () => {
    const settings = await getModelSettingsFn()
    const catalog = modelRegistry.map((m) => ({
      id: m.id,
      name: m.displayName,
      provider: m.vendor || m.provider,
      cost:
        typeof m.creditCost === 'number'
          ? m.creditCost
          : (m.creditCost?.min ?? 1),
      contextWindow: m.metadata.contextWindow,
    }))

    return {
      catalog,
      settings,
    }
  },
  component: AdminModelsPage,
})

export interface ModelCatalogItem {
  id: string
  name: string
  provider: string
  cost: number
  contextWindow: number | null
}

export interface ModelSettingItem {
  id?: string
  modelId: string
  isActive: boolean
  disabledReason: string | null
  updatedBy?: string | null
  createdAt?: Date | string | null
  updatedAt?: Date | string | null
}

export interface AdminModelsViewProps {
  catalog: ModelCatalogItem[]
  initialSettings: ModelSettingItem[]
}

export function AdminModelsView({
  catalog,
  initialSettings,
}: AdminModelsViewProps) {
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [settingsMap, setSettingsMap] = useState<
    Map<string, { isActive: boolean; disabledReason: string | null }>
  >(() => {
    const map = new Map<
      string,
      { isActive: boolean; disabledReason: string | null }
    >()
    for (const s of initialSettings) {
      map.set(s.modelId, {
        isActive: s.isActive,
        disabledReason: s.disabledReason,
      })
    }
    return map
  })

  // Disable modal state
  const [targetModelToDisable, setTargetModelToDisable] =
    useState<ModelCatalogItem | null>(null)
  const [disabledReason, setDisabledReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const providers = Array.from(new Set(catalog.map((m) => m.provider))).sort()

  const isModelActive = (modelId: string): boolean => {
    const setting = settingsMap.get(modelId)
    if (setting !== undefined) {
      return setting.isActive
    }
    return true
  }

  const getModelDisabledReason = (modelId: string): string | null => {
    return settingsMap.get(modelId)?.disabledReason ?? null
  }

  const handleToggleClick = (model: ModelCatalogItem) => {
    const active = isModelActive(model.id)
    if (active) {
      // Switching to inactive -> open dialog for reason
      setTargetModelToDisable(model)
      setDisabledReason('')
    } else {
      // Switching to active -> activate immediately
      void handleUpdateStatus(model.id, true, null)
    }
  }

  const handleUpdateStatus = async (
    modelId: string,
    isActive: boolean,
    reason: string | null,
  ) => {
    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      await updateModelAvailabilityFn({
        data: {
          modelId,
          isActive,
          disabledReason: reason,
        },
      })
      setSettingsMap((prev) => {
        const next = new Map(prev)
        next.set(modelId, { isActive, disabledReason: reason })
        return next
      })
      setStatusMessage({
        type: 'success',
        text: `Model ${modelId} berhasil di${isActive ? 'aktifkan' : 'nonaktifkan'}.`,
      })
      setTargetModelToDisable(null)
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Gagal memperbarui status model.',
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredCatalog = catalog.filter((model) => {
    const matchesSearch =
      model.name.toLowerCase().includes(search.toLowerCase()) ||
      model.id.toLowerCase().includes(search.toLowerCase())
    const matchesProvider =
      providerFilter === 'all' || model.provider === providerFilter
    return matchesSearch && matchesProvider
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-ink">
          Katalog Model AI
        </h1>
        <p className="mt-1 text-[13px] text-stone">
          Aktifkan atau nonaktifkan model secara dinamis untuk pemeliharaan
          tanpa perlu restart server.
        </p>
      </div>

      {statusMessage && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-[13px] ${
            statusMessage.type === 'success'
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-coral/30 bg-danger-soft text-coral'
          }`}
        >
          <HugeiconsIcon
            icon={
              statusMessage.type === 'success'
                ? CheckmarkCircle02Icon
                : Alert01Icon
            }
            size={16}
            strokeWidth={1.75}
          />
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Filter and Search */}
      <div className="flex flex-col gap-3 rounded-lg border border-hairline bg-pure-white p-4 shadow-xs md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            size={16}
            strokeWidth={1.75}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-stone"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari model berdasarkan nama atau ID..."
            className="h-9 w-full rounded-md border border-hairline bg-paper pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-stone focus:border-hairline-strong focus:bg-pure-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-stone">Provider:</span>
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="h-9 rounded-md border border-hairline bg-paper px-3 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
          >
            <option value="all">Semua Provider</option>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Models Table */}
      <div
        data-testid="admin-models-table"
        className="overflow-hidden rounded-lg border border-hairline bg-pure-white shadow-xs"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-hairline bg-paper text-[11px] font-semibold tracking-wider text-stone uppercase">
              <tr>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Provider</th>
                <th className="px-4 py-3">Kredit / Req</th>
                <th className="px-4 py-3">Context Window</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Sakelar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {filteredCatalog.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-stone">
                    Tidak ada model yang cocok dengan pencarian.
                  </td>
                </tr>
              ) : (
                filteredCatalog.map((model) => {
                  const active = isModelActive(model.id)
                  const reason = getModelDisabledReason(model.id)
                  return (
                    <tr
                      key={model.id}
                      className="transition-colors hover:bg-paper/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-paper text-ink">
                            <HugeiconsIcon
                              icon={CpuIcon}
                              size={16}
                              strokeWidth={1.75}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-ink">{model.name}</p>
                            <p className="font-mono text-[11px] text-stone">
                              {model.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="rounded bg-paper px-2 py-0.5 text-[11px] font-medium text-stone uppercase">
                          {model.provider}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-ink">
                        {model.cost}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-stone">
                        {model.contextWindow
                          ? `${(model.contextWindow / 1000).toLocaleString('id-ID')}k tokens`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {active ? (
                          <span className="rounded bg-success/10 border border-success/20 px-2 py-0.5 text-[11px] font-medium text-success">
                            Aktif
                          </span>
                        ) : (
                          <div className="flex flex-col">
                            <span className="rounded bg-danger-soft border border-coral/20 px-2 py-0.5 text-[11px] font-medium text-coral w-fit">
                              Nonaktif
                            </span>
                            {reason && (
                              <span
                                className="mt-0.5 max-w-[180px] truncate text-[11px] text-stone"
                                title={reason}
                              >
                                {reason}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={active}
                          data-testid={`model-status-toggle-${model.id}`}
                          onClick={() => handleToggleClick(model)}
                          disabled={isSubmitting}
                          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-notion-blue focus:ring-offset-2 disabled:opacity-50 ${
                            active ? 'bg-success' : 'bg-stone/30'
                          }`}
                        >
                          <span className="sr-only">Toggle model status</span>
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              active ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Disable confirmation dialog */}
      <Dialog
        open={targetModelToDisable !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTargetModelToDisable(null)
            setDisabledReason('')
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Nonaktifkan Model AI
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone">
              Model ini tidak akan dapat dipilih atau dipanggil oleh pengguna di
              chat workspace selama dinonaktifkan.
            </DialogDescription>
          </DialogHeader>

          {targetModelToDisable && (
            <div className="space-y-4 py-2 text-[13px]">
              <div className="rounded-md border border-hairline bg-paper p-3">
                <p className="font-semibold text-ink">
                  {targetModelToDisable.name}
                </p>
                <p className="font-mono text-[11px] text-stone">
                  {targetModelToDisable.id}
                </p>
              </div>

              <div>
                <label
                  htmlFor="disabled-reason-input"
                  className="block text-[12px] font-medium text-ink"
                >
                  Alasan Penonaktifan / Pemeliharaan
                </label>
                <textarea
                  id="disabled-reason-input"
                  value={disabledReason}
                  onChange={(e) => setDisabledReason(e.target.value)}
                  placeholder="Misal: API penyedia sedang mengalami gangguan atau lonjakan kuota..."
                  rows={3}
                  className="mt-1 w-full rounded-md border border-hairline bg-pure-white p-2.5 text-[13px] text-ink focus:border-hairline-strong focus:outline-none"
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-stone hover:bg-stone/5"
              >
                Batal
              </button>
            </DialogClose>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                if (targetModelToDisable) {
                  void handleUpdateStatus(
                    targetModelToDisable.id,
                    false,
                    disabledReason.trim() ? disabledReason.trim() : null,
                  )
                }
              }}
              className="flex items-center gap-1.5 rounded-md bg-coral px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              <span>Nonaktifkan Model</span>
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AdminModelsPage() {
  const loaderData = Route.useLoaderData()
  return (
    <AdminModelsView
      catalog={loaderData.catalog}
      initialSettings={loaderData.settings}
    />
  )
}
