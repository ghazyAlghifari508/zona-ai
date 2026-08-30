import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const getModelCatalog = vi.fn(async () => [
  {
    id: 'auto',
    displayName: 'Auto',
    provider: 'zona-router',
    vendor: 'Zona',
    intelligenceLevel: 1 as const,
    description: 'Automatic routing',
    isDefault: true,
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

vi.mock('../../src/server/functions/models', () => ({ getModelCatalog }))

describe('model catalog cache', () => {
  afterEach(cleanup)

  it('keeps model identity available across conversation remounts', async () => {
    const { useModelCatalog } = await import(
      '../../src/components/chat/useModelCatalog'
    )
    const Probe = () => (
      <span>{useModelCatalog()[0]?.displayName ?? 'loading'}</span>
    )

    const first = render(<Probe />)
    await waitFor(() => expect(screen.getByText('Auto')).toBeTruthy())
    first.unmount()

    render(<Probe />)

    expect(screen.getByText('Auto')).toBeTruthy()
    expect(getModelCatalog).toHaveBeenCalledTimes(1)
  })
})
