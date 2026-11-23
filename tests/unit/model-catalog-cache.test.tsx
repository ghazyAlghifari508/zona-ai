import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import {
  modelCatalogQueryKey,
  useModelCatalog,
} from '../../src/components/chat/useModelCatalog'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getHistoricalCatalog = vi.fn(async () => [
  {
    id: 'auto',
    displayName: 'Auto',
    routerModelId: 'zona/auto',
    provider: 'zona-router',
    vendor: 'Zona',
    intelligenceLevel: 1 as const,
    description: 'Automatic routing',
    isDefault: true,
    status: 'active' as const,
    creditTier: 'adaptive' as const,
    creditCost: 1,
    capabilities: {
      text: true,
      vision: false,
      files: false,
      tools: false,
      reasoning: false,
    },
  },
])

vi.mock('../../src/server/functions/models', () => ({ getHistoricalCatalog }))

describe('model catalog query cache', () => {
  afterEach(cleanup)

  it('reuses cached catalog across remounts and refetches after invalidation', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    })
    const Probe = () => (
      <span>{useModelCatalog()[0]?.displayName ?? 'loading'}</span>
    )
    const renderProbe = () =>
      render(
        <QueryClientProvider client={queryClient}>
          <Probe />
        </QueryClientProvider>,
      )

    const first = renderProbe()
    await waitFor(() => expect(screen.getByText('Auto')).toBeTruthy())
    first.unmount()

    const second = renderProbe()
    expect(screen.getByText('Auto')).toBeTruthy()
    expect(getHistoricalCatalog).toHaveBeenCalledTimes(1)
    second.unmount()

    await queryClient.invalidateQueries({ queryKey: modelCatalogQueryKey })
    renderProbe()
    await waitFor(() => expect(getHistoricalCatalog).toHaveBeenCalledTimes(2))
  })
})
