import {
  Alert01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { TablePagination } from '../../components/admin/TablePagination'
import { modelCatalogQueryKey } from '../../components/chat/useModelCatalog'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import {
  NativeSelect,
  NativeSelectOption,
} from '../../components/ui/native-select'
import { ProviderIcon } from '../../components/ui/ProviderIcons'
import { StatusText } from '../../components/ui/StatusText'
import type {
  AdminModelListItem,
  AdminModelListResponse,
} from '../../lib/admin/model-list-contract'
import { RESERVED_MODEL_ID } from '../../lib/models/admin-model-input'
import type {
  ConnectionProbe,
  GatewayModelDiscovery,
} from '../../lib/models/model-probe'
import { formatContextWindowTokens } from '../../lib/models/presentation'
import {
  ADMIN_MODEL_PAGE_SIZES,
  ADMIN_MODEL_SEARCH_DEBOUNCE_MS,
} from '../../lib/utils/constants'
import { serverErrorMessage } from '../../lib/utils/errors'
import {
  discoverAdminGatewayModelsFn,
  getAdminModelsFn,
  getModelSettingsFn,
  importAdminModelFn,
  probeAdminModelFn,
  retireAdminModelFn,
  updateAdminModelFn,
  updateModelAvailabilityFn,
} from '../../server/functions/admin-models'

export const Route = createFileRoute('/admin/models')({
  staleTime: 30_000,
  loader: async () => {
    const [settings, list] = await Promise.all([
      getModelSettingsFn(),
      getAdminModelsFn({
        data: { page: 1, pageSize: ADMIN_MODEL_PAGE_SIZES[0] },
      }),
    ])
    return { list, settings }
  },
  component: AdminModelsPage,
})

export type EvaluationStatus =
  | 'legacy'
  | 'pending'
  | 'verified'
  | 'failed'
  | 'inconclusive'

export interface ModelCatalogItem {
  id: string
  name: string
  provider: string
  vendor?: string
  cost: number | null
  contextWindow: number | null
  evaluationStatus?: EvaluationStatus
  status?: 'active' | 'inactive' | 'retired'
  description?: string
  lastCheckedAt?: string | null
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
  initialData: AdminModelListResponse
  initialSettings: ModelSettingItem[]
}

function toModelCatalogItem(entry: AdminModelListItem): ModelCatalogItem {
  return {
    id: entry.id,
    name: entry.displayName,
    provider: entry.provider,
    vendor: entry.vendor,
    cost:
      entry.creditCost === null
        ? null
        : typeof entry.creditCost === 'number'
          ? entry.creditCost
          : entry.creditCost.max,
    contextWindow: entry.metadata.contextWindow,
    evaluationStatus: entry.evaluationStatus,
    status: entry.status,
    description: entry.description,
    lastCheckedAt: entry.lastCheckedAt,
  }
}

interface ModelForm {
  displayName: string
  vendor: string
  provider: string
  description: string
  searchAliases: string
}

const emptyForm: ModelForm = {
  displayName: '',
  vendor: '',
  provider: '',
  description: '',
  searchAliases: '',
}

type StatusMessage = { type: 'success' | 'error'; text: string } | null

function errorMessage(error: unknown, fallback: string): string {
  return serverErrorMessage(error, fallback)
}

function isEvaluated(status: EvaluationStatus | undefined): boolean {
  return status === undefined || status === 'legacy' || status === 'verified'
}

function outcomeLabel(outcome: ConnectionProbe['outcome']): string {
  switch (outcome) {
    case 'valid':
      return 'Berhasil'
    case 'unknown':
      return 'Route tidak dikenal'
    case 'auth_failure':
      return 'Autentikasi gagal'
    case 'rate_limit':
      return 'Terkena pembatasan'
    case 'timeout':
      return 'Waktu habis'
    case 'upstream_error':
      return 'Gangguan gateway'
    case 'invalid_response':
      return 'Respons tidak valid'
  }
}

type PageSize = AdminModelListResponse['pagination']['pageSize']
type StatusFilter = 'all' | 'active' | 'inactive'

interface ListFetchParams {
  page: number
  search: string
  provider: string
  status: StatusFilter
  pageSize: PageSize
}

function isPageSize(value: number): value is PageSize {
  return ADMIN_MODEL_PAGE_SIZES.some((size) => size === value)
}

function isStatusFilter(value: string): value is StatusFilter {
  return value === 'all' || value === 'active' || value === 'inactive'
}

export function AdminModelsView({
  initialData,
  initialSettings,
}: AdminModelsViewProps) {
  const queryClient = useQueryClient()
  const [models, setModels] = useState(() =>
    initialData.items.map(toModelCatalogItem),
  )
  const [pagination, setPagination] = useState(initialData.pagination)
  const [providers, setProviders] = useState(initialData.providers)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [pageSize, setPageSize] = useState<PageSize>(
    initialData.pagination.pageSize,
  )
  const [isFetchingList, setIsFetchingList] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const hasMountedRef = useRef(false)
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

  const [addOpen, setAddOpen] = useState(false)
  const [addStep, setAddStep] = useState<1 | 2>(1)
  const [modelIdInput, setModelIdInput] = useState('')
  const [addForm, setAddForm] = useState<ModelForm>(emptyForm)
  const [discovered, setDiscovered] = useState<GatewayModelDiscovery | null>(
    null,
  )
  const [probeResult, setProbeResult] = useState<ConnectionProbe | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  const [editTarget, setEditTarget] = useState<ModelCatalogItem | null>(null)
  const [editForm, setEditForm] = useState<ModelForm>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<ModelCatalogItem | null>(
    null,
  )
  const [targetModelToDisable, setTargetModelToDisable] =
    useState<ModelCatalogItem | null>(null)
  const [disabledReason, setDisabledReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [statusMessage, setStatusMessage] = useState<StatusMessage>(null)

  const invalidateRelatedQueries = () => {
    void queryClient.invalidateQueries({ queryKey: modelCatalogQueryKey })
    void queryClient.invalidateQueries({ queryKey: ['admin-models'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-metrics'] })
    void queryClient.invalidateQueries({ queryKey: ['admin-audit'] })
  }

  const fetchList = useCallback(async (params: ListFetchParams) => {
    const requestId = ++requestIdRef.current
    setIsFetchingList(true)
    setListError(null)
    try {
      const result = await getAdminModelsFn({
        data: {
          page: params.page,
          pageSize: params.pageSize,
          search: params.search || undefined,
          provider: params.provider === 'all' ? undefined : params.provider,
          status: params.status === 'all' ? undefined : params.status,
        },
      })

      if (requestId !== requestIdRef.current) return
      setModels(result.items.map(toModelCatalogItem))
      setPagination(result.pagination)
      setProviders(result.providers)
    } catch (error) {
      if (requestId !== requestIdRef.current) return
      setListError(errorMessage(error, 'Gagal memuat daftar model.'))
    } finally {
      if (requestId === requestIdRef.current) setIsFetchingList(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedSearch(search.trim()),
      ADMIN_MODEL_SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }
    void fetchList({
      page: 1,
      search: debouncedSearch,
      provider: providerFilter,
      status: statusFilter,
      pageSize,
    })
  }, [debouncedSearch, providerFilter, statusFilter, pageSize, fetchList])

  const refreshList = useCallback(async () => {
    await fetchList({
      page: pagination.page,
      search: debouncedSearch,
      provider: providerFilter,
      status: statusFilter,
      pageSize,
    })
  }, [
    fetchList,
    pagination.page,
    debouncedSearch,
    providerFilter,
    statusFilter,
    pageSize,
  ])

  const resetFilters = () => {
    setSearch('')
    setDebouncedSearch('')
    setProviderFilter('all')
    setStatusFilter('all')
  }

  const isModelActive = (modelId: string): boolean =>
    settingsMap.get(modelId)?.isActive ?? true

  const getModelDisabledReason = (modelId: string): string | null =>
    settingsMap.get(modelId)?.disabledReason ?? null

  const resetAddDialog = () => {
    setAddStep(1)
    setModelIdInput('')
    setAddForm(emptyForm)
    setDiscovered(null)
    setProbeResult(null)
    setProbeError(null)
  }

  const handleCheckModel = async () => {
    const modelId = modelIdInput.trim()
    if (!modelId) {
      setProbeError('Masukkan ID model yang tersedia di 9Router.')
      return
    }
    setChecking(true)
    setProbeError(null)
    let found: GatewayModelDiscovery | null = null
    try {
      const entries = await discoverAdminGatewayModelsFn()
      found = entries.find((entry) => entry.id === modelId) ?? null
    } catch {
      found = null
    }
    try {
      const result = await probeAdminModelFn({ data: { modelId } })
      setProbeResult(result)
      setDiscovered(found)
      setAddForm((current) => ({
        ...current,
        displayName: current.displayName || found?.label || '',
        vendor: current.vendor || found?.provider || '',
        provider: current.provider || found?.provider?.toLowerCase() || '',
      }))
      setAddStep(2)
    } catch (error) {
      setProbeError(
        errorMessage(error, 'Model tidak dapat diperiksa saat ini.'),
      )
    } finally {
      setChecking(false)
    }
  }

  const handleImportModel = async () => {
    const modelId = modelIdInput.trim()
    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      await importAdminModelFn({
        data: {
          modelId,
          displayName: addForm.displayName.trim(),
          vendor: addForm.vendor.trim(),
          provider: addForm.provider.trim(),
          description: addForm.description.trim(),
          searchAliases: addForm.searchAliases
            .split(',')
            .map((alias) => alias.trim())
            .filter(Boolean),
          contextWindow: discovered?.contextWindow ?? null,
        },
      })
      await refreshList()
      setSettingsMap((current) => {
        const next = new Map(current)
        next.set(modelId, { isActive: true, disabledReason: null })
        return next
      })
      setStatusMessage({
        type: 'success',
        text: `${modelId} disimpan sebagai draft Belum dievaluasi.`,
      })
      setAddOpen(false)
      resetAddDialog()
      invalidateRelatedQueries()
    } catch (error) {
      setProbeError(errorMessage(error, 'Gagal menyimpan model.'))
    } finally {
      setIsSubmitting(false)
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
        data: { modelId, isActive, disabledReason: reason },
      })
      setSettingsMap((prev) => {
        const next = new Map(prev)
        next.set(modelId, { isActive, disabledReason: reason })
        return next
      })
      setStatusMessage({
        type: 'success',
        text: `Status ${modelId} berhasil diperbarui.`,
      })
      setTargetModelToDisable(null)
      invalidateRelatedQueries()
      await refreshList()
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: errorMessage(error, 'Gagal memperbarui status model.'),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const openEdit = (model: ModelCatalogItem) => {
    setEditTarget(model)
    setEditForm({
      displayName: model.name,
      vendor: model.vendor ?? '',
      provider: model.provider,
      description: model.description ?? '',
      searchAliases: '',
    })
  }

  const handleUpdateModel = async () => {
    if (!editTarget) return
    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      await updateAdminModelFn({
        data: {
          modelId: editTarget.id,
          displayName: editForm.displayName.trim(),
          vendor: editForm.vendor.trim(),
          provider: editForm.provider.trim(),
          description: editForm.description.trim(),
          searchAliases: editForm.searchAliases
            .split(',')
            .map((alias) => alias.trim())
            .filter(Boolean),
        },
      })

      setStatusMessage({
        type: 'success',
        text: `Metadata ${editTarget.id} berhasil diperbarui.`,
      })
      setEditTarget(null)
      invalidateRelatedQueries()
      await refreshList()
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: errorMessage(error, 'Gagal memperbarui metadata model.'),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProbeModel = async (model: ModelCatalogItem) => {
    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      const result = await probeAdminModelFn({ data: { modelId: model.id } })
      setModels((current) =>
        current.map((entry) =>
          entry.id === model.id
            ? { ...entry, lastCheckedAt: result.checkedAt }
            : entry,
        ),
      )
      setStatusMessage({
        type: result.outcome === 'valid' ? 'success' : 'error',
        text: `${model.id}: ${outcomeLabel(result.outcome)}. ${result.message}`,
      })
      invalidateRelatedQueries()
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: errorMessage(error, 'Uji koneksi gagal.'),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRetireModel = async () => {
    if (!deleteTarget) return
    setIsSubmitting(true)
    setStatusMessage(null)
    try {
      await retireAdminModelFn({ data: { modelId: deleteTarget.id } })

      setSettingsMap((current) => {
        const next = new Map(current)
        next.set(deleteTarget.id, {
          isActive: false,
          disabledReason: null,
        })
        return next
      })
      setStatusMessage({
        type: 'success',
        text: `${deleteTarget.id} dihapus dari pilihan model. Riwayat tetap tersimpan.`,
      })
      setDeleteTarget(null)
      invalidateRelatedQueries()
      await refreshList()
    } catch (error) {
      setStatusMessage({
        type: 'error',
        text: errorMessage(error, 'Gagal menghapus model.'),
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight text-ink">
            Model AI
          </h1>
          <p className="mt-1 text-[13px] text-stone">
            Kelola model yang tersedia di Zona.ai.
          </p>
        </div>
        <button
          type="button"
          data-testid="add-model-trigger"
          onClick={() => {
            resetAddDialog()
            setAddOpen(true)
          }}
          className="h-9 rounded-md bg-accent px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2"
        >
          + Tambah model
        </button>
      </div>

      {statusMessage && (
        <div
          role="status"
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
            aria-label="Cari model"
            placeholder="Cari model berdasarkan nama atau ID..."
            data-testid="model-search"
            className="h-9 w-full rounded-md border border-hairline bg-paper pr-3 pl-9 text-[13px] text-ink transition-colors placeholder:text-stone focus:border-hairline-strong focus:bg-pure-white focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="provider-filter" className="text-[12px] text-stone">
            Provider:
          </label>
          <NativeSelect
            id="provider-filter"
            data-testid="model-provider-filter"
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
          >
            <NativeSelectOption value="all">Semua provider</NativeSelectOption>
            {providers.map((p) => (
              <NativeSelectOption key={p} value={p}>
                {p}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <NativeSelect
            id="status-filter"
            data-testid="model-status-filter"
            value={statusFilter}
            onChange={(e) => {
              const value = e.target.value
              if (isStatusFilter(value)) setStatusFilter(value)
            }}
          >
            <NativeSelectOption value="all">Semua status</NativeSelectOption>
            <NativeSelectOption value="active">Aktif</NativeSelectOption>
            <NativeSelectOption value="inactive">Nonaktif</NativeSelectOption>
          </NativeSelect>
        </div>
      </div>

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
                <th className="px-4 py-3">Kredit / permintaan</th>
                <th className="px-4 py-3">Kapasitas konteks</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {models.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center">
                    <p className="font-medium text-ink">0 model</p>
                    <p className="mt-1 text-[13px] text-stone">
                      Tidak ada model yang cocok
                    </p>
                    {(search.trim() !== '' ||
                      providerFilter !== 'all' ||
                      statusFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={resetFilters}
                        className="mt-3 text-[13px] font-medium text-notion-blue hover:underline"
                      >
                        Hapus filter
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                models.map((model) => {
                  const active = isModelActive(model.id)
                  const reason = getModelDisabledReason(model.id)
                  const evaluated = isEvaluated(model.evaluationStatus)
                  return (
                    <tr
                      key={model.id}
                      data-testid={`model-row-${model.id}`}
                      data-page={pagination.page}
                      className="transition-colors hover:bg-paper/40"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-hairline bg-pure-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                            <ProviderIcon
                              provider={model.provider || model.vendor || ''}
                              size={18}
                            />
                          </div>
                          <div className="min-w-0">
                            <p
                              className="font-medium text-ink"
                              title={model.name}
                            >
                              {model.name}
                            </p>
                            <p
                              className="font-mono text-[11px] text-stone break-all"
                              title={model.id}
                            >
                              {model.id}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <StatusText>
                          {model.vendor || model.provider}
                        </StatusText>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-ink">
                        {model.cost ?? '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-stone">
                        {formatContextWindowTokens(model.contextWindow)}
                      </td>
                      <td className="px-4 py-3">
                        {!evaluated ? (
                          <span data-testid={`model-evaluation-${model.id}`}>
                            <StatusText>Belum dievaluasi</StatusText>
                          </span>
                        ) : active ? (
                          <StatusText>Aktif</StatusText>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <StatusText tone="danger">Nonaktif</StatusText>
                            {reason && (
                              <span
                                className="max-w-[240px] text-[11px] leading-snug text-stone break-words"
                                title={reason}
                              >
                                {reason}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={active && evaluated}
                            aria-label={`Aktifkan ${model.name}`}
                            data-testid={`model-status-toggle-${model.id}`}
                            onClick={() => {
                              if (active) setTargetModelToDisable(model)
                              else void handleUpdateStatus(model.id, true, null)
                            }}
                            disabled={
                              isSubmitting ||
                              !evaluated ||
                              model.id === RESERVED_MODEL_ID
                            }
                            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-notion-blue focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                              active && evaluated
                                ? 'bg-accent'
                                : 'bg-hairline-strong'
                            }`}
                          >
                            <span className="sr-only">
                              Alihkan status model
                            </span>
                            <span
                              aria-hidden="true"
                              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                active && evaluated
                                  ? 'translate-x-5'
                                  : 'translate-x-0'
                              }`}
                            />
                          </button>
                          {model.id === RESERVED_MODEL_ID ? null : (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={`Aksi untuk ${model.name}`}
                                  data-testid={`model-actions-${model.id}`}
                                  disabled={isSubmitting}
                                  className="flex h-8 w-8 items-center justify-center rounded-md border border-hairline text-stone transition-colors hover:bg-paper focus:outline-none focus:ring-2 focus:ring-notion-blue disabled:opacity-50"
                                >
                                  <span aria-hidden="true">⋮</span>
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  data-testid={`model-edit-${model.id}`}
                                  onSelect={() => openEdit(model)}
                                >
                                  Edit model
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  data-testid={`model-probe-${model.id}`}
                                  onSelect={() => void handleProbeModel(model)}
                                >
                                  Uji koneksi
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  data-testid={`model-delete-${model.id}`}
                                  className="text-coral focus:bg-danger-soft focus:text-coral"
                                  onSelect={() => setDeleteTarget(model)}
                                >
                                  Hapus model
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {listError && (
          <div
            data-testid="model-list-error"
            role="alert"
            className="flex flex-wrap items-center justify-between gap-2 border-t border-hairline bg-danger-soft px-4 py-2.5 text-[13px] text-coral"
          >
            <span>{listError}</span>
            <button
              type="button"
              data-testid="model-list-retry"
              onClick={() => void refreshList()}
              className="font-medium underline"
            >
              Coba lagi
            </button>
          </div>
        )}
        <div className="border-t border-hairline">
          <TablePagination
            ariaLabel="Navigasi halaman model"
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            pageSize={pageSize}
            pageSizes={ADMIN_MODEL_PAGE_SIZES}
            pageSizeTestId="model-page-size"
            disabled={isFetchingList}
            onPageChange={(page) =>
              void fetchList({
                page,
                search: debouncedSearch,
                provider: providerFilter,
                status: statusFilter,
                pageSize,
              })
            }
            onPageSizeChange={(size) => {
              if (isPageSize(size)) setPageSize(size)
            }}
          />
        </div>
      </div>

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmitting && !checking) setAddOpen(false)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Tambah model AI
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone">
              Masukkan ID model yang tersedia di 9Router.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-[13px]">
            <div>
              <label
                htmlFor="model-id-input"
                className="block text-[12px] font-medium text-ink"
              >
                Model ID
              </label>
              <input
                id="model-id-input"
                value={modelIdInput}
                onChange={(event) => setModelIdInput(event.target.value)}
                disabled={addStep === 2 || checking || isSubmitting}
                placeholder="exact/provider/model:free"
                className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 font-mono text-[12px] text-ink focus:border-hairline-strong focus:outline-none disabled:bg-paper"
              />
            </div>

            {addStep === 1 ? (
              <button
                type="button"
                data-testid="check-model-trigger"
                onClick={() => void handleCheckModel()}
                disabled={checking || modelIdInput.trim().length === 0}
                className="flex h-9 items-center gap-1.5 rounded-md border border-hairline bg-pure-white px-3 font-medium text-ink transition-colors hover:bg-paper focus:outline-none focus:ring-2 focus:ring-notion-blue disabled:opacity-50"
              >
                {checking && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={14}
                    className="animate-spin"
                  />
                )}
                Periksa model
              </button>
            ) : (
              <>
                <div
                  data-testid="probe-result"
                  className="rounded-md border border-hairline bg-paper p-3"
                >
                  <p className="font-medium text-ink">
                    Koneksi:{' '}
                    {probeResult ? outcomeLabel(probeResult.outcome) : '—'}
                  </p>
                  {probeResult && (
                    <p className="mt-1 text-[12px] text-stone">
                      {probeResult.message}
                    </p>
                  )}
                  <p className="mt-1 text-[12px] text-stone">
                    Kapasitas konteks:{' '}
                    {formatContextWindowTokens(
                      discovered?.contextWindow ?? null,
                    )}
                  </p>
                  <p className="mt-1 text-[12px] text-stone">
                    Evaluasi: Belum dievaluasi (model belum tersedia di
                    workspace)
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="block text-[12px] font-medium text-ink">
                    Nama tampilan
                    <input
                      data-testid="add-display-name"
                      value={addForm.displayName}
                      onChange={(event) =>
                        setAddForm((current) => ({
                          ...current,
                          displayName: event.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-ink">
                    Vendor
                    <input
                      data-testid="add-vendor"
                      value={addForm.vendor}
                      onChange={(event) =>
                        setAddForm((current) => ({
                          ...current,
                          vendor: event.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-ink">
                    Provider
                    <input
                      data-testid="add-provider"
                      value={addForm.provider}
                      onChange={(event) =>
                        setAddForm((current) => ({
                          ...current,
                          provider: event.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                    />
                  </label>
                  <label className="block text-[12px] font-medium text-ink">
                    Search aliases
                    <input
                      data-testid="add-aliases"
                      value={addForm.searchAliases}
                      onChange={(event) =>
                        setAddForm((current) => ({
                          ...current,
                          searchAliases: event.target.value,
                        }))
                      }
                      className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                    />
                  </label>
                </div>
                <label className="block text-[12px] font-medium text-ink">
                  Deskripsi
                  <textarea
                    data-testid="add-description"
                    value={addForm.description}
                    onChange={(event) =>
                      setAddForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    rows={2}
                    className="mt-1 w-full rounded-md border border-hairline bg-pure-white p-2.5 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                  />
                </label>
              </>
            )}

            {probeError && (
              <p role="alert" className="text-[12px] text-coral">
                {probeError}
              </p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <button
                type="button"
                disabled={isSubmitting || checking}
                className="rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-stone hover:bg-paper disabled:opacity-50"
              >
                Batal
              </button>
            </DialogClose>
            {addStep === 2 && (
              <button
                type="button"
                data-testid="submit-add-model"
                disabled={
                  isSubmitting ||
                  addForm.displayName.trim().length === 0 ||
                  addForm.vendor.trim().length === 0 ||
                  addForm.provider.trim().length === 0
                }
                onClick={() => void handleImportModel()}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting && (
                  <HugeiconsIcon
                    icon={Loading03Icon}
                    size={14}
                    className="animate-spin"
                  />
                )}
                Tambah model
              </button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setEditTarget(null)
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Edit model
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone">
              Identity route tidak dapat diubah. Import entry baru bila route
              berbeda.
            </DialogDescription>
          </DialogHeader>
          {editTarget && (
            <div className="grid gap-3 py-2 text-[13px] md:grid-cols-2">
              <label className="block text-[12px] font-medium text-ink">
                Nama tampilan
                <input
                  data-testid="edit-display-name"
                  value={editForm.displayName}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                />
              </label>
              <label className="block text-[12px] font-medium text-ink">
                Vendor
                <input
                  data-testid="edit-vendor"
                  value={editForm.vendor}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      vendor: event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                />
              </label>
              <label className="block text-[12px] font-medium text-ink">
                Provider
                <input
                  data-testid="edit-provider"
                  value={editForm.provider}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      provider: event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                />
              </label>
              <label className="block text-[12px] font-medium text-ink">
                Search aliases
                <input
                  data-testid="edit-aliases"
                  value={editForm.searchAliases}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      searchAliases: event.target.value,
                    }))
                  }
                  className="mt-1 h-9 w-full rounded-md border border-hairline bg-pure-white px-3 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                />
              </label>
              <label className="block text-[12px] font-medium text-ink md:col-span-2">
                Deskripsi
                <textarea
                  data-testid="edit-description"
                  value={editForm.description}
                  onChange={(event) =>
                    setEditForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={2}
                  className="mt-1 w-full rounded-md border border-hairline bg-pure-white p-2.5 text-[13px] font-normal text-ink focus:border-hairline-strong focus:outline-none"
                />
              </label>
            </div>
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <button
                type="button"
                disabled={isSubmitting}
                className="rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-stone hover:bg-paper disabled:opacity-50"
              >
                Batal
              </button>
            </DialogClose>
            <button
              type="button"
              data-testid="submit-edit-model"
              disabled={
                isSubmitting || editForm.displayName.trim().length === 0
              }
              onClick={() => void handleUpdateModel()}
              className="rounded-md bg-accent px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              Simpan perubahan
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setDeleteTarget(null)
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[17px] font-bold text-ink">
              Hapus model?
            </DialogTitle>
            <DialogDescription className="text-[13px] text-stone">
              {deleteTarget?.name} akan dihapus dari pilihan model di Zona.ai.
              Percakapan dan riwayat penggunaan sebelumnya tetap tersimpan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <button
                type="button"
                disabled={isSubmitting}
                className="rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-stone hover:bg-paper disabled:opacity-50"
              >
                Batal
              </button>
            </DialogClose>
            <button
              type="button"
              data-testid="confirm-retire-model"
              disabled={isSubmitting}
              onClick={() => void handleRetireModel()}
              className="flex items-center gap-1.5 rounded-md bg-coral px-3 py-1.5 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting && (
                <HugeiconsIcon
                  icon={Loading03Icon}
                  size={14}
                  className="animate-spin"
                />
              )}
              Hapus model
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={targetModelToDisable !== null}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) {
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
              <div className="flex items-center gap-3 rounded-md border border-hairline bg-paper p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-hairline bg-pure-white text-ink shadow-[0_1px_2px_rgba(0,0,0,0.03)]">
                  <ProviderIcon
                    provider={
                      targetModelToDisable.provider ||
                      targetModelToDisable.vendor ||
                      ''
                    }
                    size={18}
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-ink">
                    {targetModelToDisable.name}
                  </p>
                  <p className="font-mono text-[11px] text-stone">
                    {targetModelToDisable.id}
                  </p>
                </div>
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
                disabled={isSubmitting}
                className="rounded-md border border-hairline bg-pure-white px-3 py-1.5 text-[13px] font-medium text-stone hover:bg-paper disabled:opacity-50"
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
      initialData={loaderData.list}
      initialSettings={loaderData.settings}
    />
  )
}
