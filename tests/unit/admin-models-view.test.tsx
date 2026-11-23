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

const callSchema = z.object({ data: z.record(z.string(), z.unknown()) })

function calledData(mock: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  return callSchema.parse(mock.mock.calls[0]?.[0]).data
}

function renderView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminModelsView
        catalog={[activeModel, pendingModel]}
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
