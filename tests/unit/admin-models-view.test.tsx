import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import {
  AdminModelsView,
  type ModelCatalogItem,
  type ModelSettingItem,
} from '../../src/routes/admin/models'
import type {
  AdminModelListItem,
  AdminModelListResponse,
} from '../../src/lib/admin/model-list-contract'
import { getAdminModelsFn } from '../../src/server/functions/admin-models'

const discover = vi.fn()
const importModel = vi.fn()
const updateModel = vi.fn()
const probeModel = vi.fn()
const retireModel = vi.fn()

vi.mock('../../src/server/functions/admin-models', () => ({
  getModelSettingsFn: vi.fn(),
  getAdminModelsFn: vi.fn(),
  discoverAdminGatewayModelsFn: (...args: unknown[]) => discover(...args),
  importAdminModelFn: (...args: unknown[]) => importModel(...args),
  updateAdminModelFn: (...args: unknown[]) => updateModel(...args),
  probeAdminModelFn: (...args: unknown[]) => probeModel(...args),
  retireAdminModelFn: (...args: unknown[]) => retireModel(...args),
  updateModelAvailabilityFn: vi.fn(),
}))

const activeModel: ModelCatalogItem = {
  id: 'cx/gpt-5.6-sol',
  name: 'GPT 5.6 Sol',
  provider: 'codex',
  vendor: 'OpenAI',
  cost: 4,
  contextWindow: 200_000,
  evaluationStatus: 'legacy',
  status: 'active',
  description: 'Legacy route',
}

const pendingModel: ModelCatalogItem = {
  id: 'custom/route:free',
  name: 'Custom Route',
  provider: 'custom',
  vendor: 'Custom',
  cost: null,
  contextWindow: null,
  evaluationStatus: 'pending',
  status: 'active',
}

const settings: ModelSettingItem[] = [
  { modelId: activeModel.id, isActive: true, disabledReason: null },
]

function toListItem(model: ModelCatalogItem): AdminModelListItem {
  return {
    id: model.id,
    routerModelId: model.id,
    displayName: model.name,
    provider: model.provider,
    vendor: model.vendor ?? 'Unknown',
    description: model.description ?? '',
    intelligenceLevel: 2,
    intelligenceScore: 2,
    intelligenceBars: 2,
    confidence: 'medium',
    creditCost: model.cost,
    creditTier: 'balanced',
    capabilities: {
      text: true,
      vision: false,
      files: false,
      tools: false,
      reasoning: false,
      structuredOutput: true,
    },
    searchAliases: [],
    aliasIds: [],
    evaluationStatus: model.evaluationStatus ?? 'pending',
    visionStatus: 'unverified',
    isDefault: false,
    isActive: true,
    status: model.status ?? 'active',
    disabledReason: null,
    metadata: {
      contextWindow: model.contextWindow,
      maxOutput: null,
      pricing: null,
      category: 'general',
      speedClass: 'medium',
    },
    lastCheckedAt: model.lastCheckedAt ?? null,
  }
}

function makeResponse(
  items: ModelCatalogItem[] = [activeModel, pendingModel],
  overrides: Partial<AdminModelListResponse['pagination']> = {},
): AdminModelListResponse {
  return {
    items: items.map(toListItem),
    pagination: {
      page: 1,
      pageSize: 10,
      total: items.length,
      totalPages: 1,
      start: items.length === 0 ? 0 : 1,
      end: items.length,
      ...overrides,
    },
    providers: ['codex', 'custom', 'OpenAI', 'Custom'],
  }
}

const callSchema = z.object({ data: z.record(z.string(), z.unknown()) })

function calledData(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  return callSchema.parse(mock.mock.calls[0]?.[0]).data
}

function renderView(response = makeResponse()) {
  vi.mocked(getAdminModelsFn).mockResolvedValue(response)
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminModelsView
        initialData={response}
        initialSettings={settings}
      />
    </QueryClientProvider>,
  )
}

function openActions(modelId: string) {
  const trigger = screen.getByTestId(`model-actions-${modelId}`)
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.click(trigger)
}

const probeResponse = {
  modelId: 'custom/route:free',
  outcome: 'valid',
  listed: true,
  httpStatus: 200,
  durationMs: 12,
  identityModel: 'custom/route:free',
  provider: 'custom',
  provenanceVerified: true,
  message: 'Koneksi berhasil.',
  checkedAt: '2026-11-23T00:00:00.000Z',
}

describe('Admin model management actions', () => {
  beforeEach(() => {
    discover.mockReset().mockResolvedValue([
      {
        id: 'custom/route:free',
        label: 'Discovered Route',
        contextWindow: 128_000,
        maxOutput: null,
        provider: 'custom',
      },
    ])
    importModel.mockReset().mockResolvedValue({ success: true })
    updateModel.mockReset().mockResolvedValue({ success: true })
    probeModel.mockReset().mockResolvedValue(probeResponse)
    retireModel.mockReset().mockResolvedValue({ success: true })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('checks the exact route and imports without invented rating or credit', async () => {
    renderView()

    fireEvent.click(screen.getByTestId('add-model-trigger'))
    fireEvent.change(screen.getByLabelText('Model ID'), {
      target: { value: ' custom/route:free ' },
    })
    fireEvent.click(screen.getByTestId('check-model-trigger'))

    await waitFor(() => {
      expect(screen.getByTestId('probe-result')).toBeTruthy()
    })
    expect(calledData(probeModel).modelId).toBe('custom/route:free')
    expect(screen.getByLabelText('Nama tampilan')).toHaveProperty(
      'value',
      'Discovered Route',
    )

    fireEvent.change(screen.getByLabelText('Nama tampilan'), {
      target: { value: 'Custom Route' },
    })
    fireEvent.change(screen.getByLabelText('Vendor'), {
      target: { value: 'Custom' },
    })
    fireEvent.change(screen.getByLabelText('Provider'), {
      target: { value: 'custom' },
    })
    fireEvent.click(screen.getByTestId('submit-add-model'))

    await waitFor(() => expect(importModel).toHaveBeenCalledTimes(1))
    const payload = calledData(importModel)
    expect(payload.modelId).toBe('custom/route:free')
    expect(payload.contextWindow).toBe(128_000)
    expect(payload).not.toHaveProperty('creditCost')
    expect(payload).not.toHaveProperty('intelligenceScore')
    expect(payload).not.toHaveProperty('capabilities')
  })

  it('keeps input and reports duplicate rejection', async () => {
    importModel.mockRejectedValueOnce(new Error('Route model sudah terdaftar'))
    renderView()

    fireEvent.click(screen.getByTestId('add-model-trigger'))
    fireEvent.change(screen.getByLabelText('Model ID'), {
      target: { value: 'cx/deepseek-chat' },
    })
    fireEvent.click(screen.getByTestId('check-model-trigger'))
    await waitFor(() => screen.getByTestId('probe-result'))

    fireEvent.change(screen.getByLabelText('Nama tampilan'), {
      target: { value: 'DeepSeek' },
    })
    fireEvent.change(screen.getByLabelText('Vendor'), {
      target: { value: 'DeepSeek' },
    })
    fireEvent.change(screen.getByLabelText('Provider'), {
      target: { value: 'cx' },
    })
    fireEvent.click(screen.getByTestId('submit-add-model'))

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('sudah terdaftar')
    })
    expect(screen.getByLabelText('Model ID')).toHaveProperty(
      'value',
      'cx/deepseek-chat',
    )
  })

  it('routes overflow actions to update, probe and retire handlers', async () => {
    renderView()

    openActions(activeModel.id)
    fireEvent.click(screen.getByTestId(`model-edit-${activeModel.id}`))

    await waitFor(() => {
      expect(screen.getByTestId('edit-display-name')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('submit-edit-model'))
    await waitFor(() => expect(updateModel).toHaveBeenCalledTimes(1))
    expect(calledData(updateModel).modelId).toBe(activeModel.id)

    openActions(activeModel.id)
    fireEvent.click(screen.getByTestId(`model-probe-${activeModel.id}`))
    await waitFor(() => expect(probeModel).toHaveBeenCalledTimes(1))

    openActions(activeModel.id)
    fireEvent.click(screen.getByTestId(`model-delete-${activeModel.id}`))
    await waitFor(() => {
      expect(screen.getByTestId('confirm-retire-model')).toBeTruthy()
    })
    fireEvent.click(screen.getByTestId('confirm-retire-model'))
    await waitFor(() => expect(retireModel).toHaveBeenCalledTimes(1))
    expect(calledData(retireModel).modelId).toBe(activeModel.id)
  })

  it('blocks availability changes for unevaluated models', () => {
    renderView()
    const toggle = screen.getByTestId(
      `model-status-toggle-${pendingModel.id}`,
    ) as HTMLButtonElement
    expect(toggle.disabled).toBe(true)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(
      screen.getByTestId(`model-evaluation-${pendingModel.id}`).textContent,
    ).toContain('Belum dievaluasi')
  })

  it('disables controls while a mutation is pending', async () => {
    const gate = Promise.withResolvers<void>()
    probeModel.mockReturnValueOnce(gate.promise)

    renderView()
    openActions(activeModel.id)
    fireEvent.click(screen.getByTestId(`model-probe-${activeModel.id}`))

    await waitFor(() => {
      expect(
        (
          screen.getByTestId(
            `model-actions-${activeModel.id}`,
          ) as HTMLButtonElement
        ).disabled,
      ).toBe(true)
    })
    gate.resolve()
  })
})

function lastCalledData(): Record<string, unknown> {
  const calls = vi.mocked(getAdminModelsFn).mock.calls
  return callSchema.parse(calls[calls.length - 1]?.[0]).data
}

describe('Admin model list pagination', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('resets page to one when search changes', async () => {
    renderView(
      makeResponse([activeModel], {
        page: 2,
        pageSize: 10,
        total: 25,
        totalPages: 3,
        start: 11,
        end: 20,
      }),
    )

    fireEvent.change(screen.getByLabelText('Cari model'), {
      target: { value: 'sol' },
    })

    await waitFor(
      () => {
        expect(lastCalledData()).toMatchObject({ page: 1, search: 'sol' })
      },
      { timeout: 1500 },
    )
  })

  it('resets page to one when page size, provider, or status changes', async () => {
    renderView(
      makeResponse([activeModel], {
        page: 3,
        total: 25,
        totalPages: 3,
        start: 21,
        end: 25,
      }),
    )

    fireEvent.change(screen.getByTestId('model-page-size'), {
      target: { value: '20' },
    })
    await waitFor(() =>
      expect(lastCalledData()).toMatchObject({ page: 1, pageSize: 20 }),
    )

    fireEvent.change(screen.getByTestId('model-provider-filter'), {
      target: { value: 'codex' },
    })
    await waitFor(() =>
      expect(lastCalledData()).toMatchObject({
        page: 1,
        provider: 'codex',
        pageSize: 20,
      }),
    )

    fireEvent.change(screen.getByTestId('model-status-filter'), {
      target: { value: 'inactive' },
    })
    await waitFor(() =>
      expect(lastCalledData()).toMatchObject({
        page: 1,
        provider: 'codex',
        status: 'inactive',
        pageSize: 20,
      }),
    )
  })

  it('requests the next page and disables next on the last page', async () => {
    renderView(
      makeResponse([activeModel], {
        page: 2,
        total: 25,
        totalPages: 3,
        start: 11,
        end: 20,
      }),
    )
    vi.mocked(getAdminModelsFn).mockResolvedValue(
      makeResponse([activeModel], {
        page: 3,
        total: 25,
        totalPages: 3,
        start: 21,
        end: 25,
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }))
    await waitFor(() =>
      expect(lastCalledData()).toMatchObject({ page: 3, pageSize: 10 }),
    )
    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Berikutnya' }) as HTMLButtonElement)
          .disabled,
      ).toBe(true),
    )
  })

  it('ignores a late response from an older filter request', async () => {
    const slow = Promise.withResolvers<AdminModelListResponse>()
    const fast = Promise.withResolvers<AdminModelListResponse>()
    renderView()
    vi.mocked(getAdminModelsFn).mockImplementation((arg) => {
      const data = callSchema.parse(arg).data
      return data.provider === 'codex' ? slow.promise : fast.promise
    })
    fireEvent.change(screen.getByTestId('model-provider-filter'), {
      target: { value: 'codex' },
    })
    fireEvent.change(screen.getByTestId('model-provider-filter'), {
      target: { value: 'custom' },
    })
    fast.resolve(makeResponse([pendingModel]))
    await waitFor(() => {
      expect(screen.queryByTestId(`model-row-${activeModel.id}`)).toBeNull()
      expect(screen.getByTestId(`model-row-${pendingModel.id}`)).toBeDefined()
    })

    slow.resolve(makeResponse([activeModel]))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTestId(`model-row-${activeModel.id}`)).toBeNull()
    expect(screen.getByTestId(`model-row-${pendingModel.id}`)).toBeDefined()
  })

  it('shows an honest empty state without impossible page labels', () => {
    renderView(
      makeResponse([], {
        page: 1,
        total: 0,
        totalPages: 0,
        start: 0,
        end: 0,
      }),
    )

    expect(screen.getByText('0 model')).toBeDefined()
    expect(screen.getByText('Tidak ada model yang cocok')).toBeDefined()
    expect(screen.queryByText('Halaman 1 dari 0')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Berikutnya' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('keeps the last valid list on error and retries explicitly', async () => {
    renderView(
      makeResponse([activeModel], {
        page: 1,
        total: 12,
        totalPages: 2,
        start: 1,
        end: 10,
      }),
    )
    vi.mocked(getAdminModelsFn).mockRejectedValueOnce(
      new Error('jaringan gagal'),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Berikutnya' }))
    await waitFor(() => {
      expect(screen.getByTestId('model-list-error').textContent).toContain(
        'jaringan gagal',
      )
    })
    expect(screen.getByTestId(`model-row-${activeModel.id}`)).toBeDefined()
    expect(screen.getByTestId(`model-row-${activeModel.id}`).getAttribute('data-page')).toBe('1')

    fireEvent.click(screen.getByTestId('model-list-retry'))
    await waitFor(() => {
      expect(screen.queryByTestId('model-list-error')).toBeNull()
    })
  })
})
