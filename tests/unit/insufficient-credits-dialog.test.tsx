import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { InsufficientCreditsDialog } from '../../src/components/chat/InsufficientCreditsDialog'

describe('InsufficientCreditsDialog', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function renderOpen(overrides?: {
    onOpenChange?: (open: boolean) => void
    onViewPlans?: () => void
  }) {
    return render(
      <InsufficientCreditsDialog
        open
        onOpenChange={overrides?.onOpenChange ?? (() => undefined)}
        onViewPlans={overrides?.onViewPlans ?? (() => undefined)}
      />,
    )
  }

  it('renders dialog regions when open', () => {
    const { getByTestId } = renderOpen()
    expect(getByTestId('insufficient-credits-dialog')).toBeDefined()
    expect(getByTestId('insufficient-credits-view-plans')).toBeDefined()
    expect(getByTestId('insufficient-credits-close')).toBeDefined()
  })

  it('renders nothing when closed', () => {
    const { queryByTestId } = render(
      <InsufficientCreditsDialog
        open={false}
        onOpenChange={() => undefined}
        onViewPlans={() => undefined}
      />,
    )
    expect(queryByTestId('insufficient-credits-dialog')).toBeNull()
  })

  it('calls onViewPlans once when the plans CTA is clicked', () => {
    const onViewPlans = vi.fn()
    const { getByTestId } = renderOpen({ onViewPlans })
    fireEvent.click(getByTestId('insufficient-credits-view-plans'))
    expect(onViewPlans).toHaveBeenCalledTimes(1)
  })

  it('forwards explicit close through onOpenChange(false)', () => {
    const onOpenChange = vi.fn()
    const { getByTestId } = renderOpen({ onOpenChange })
    fireEvent.click(getByTestId('insufficient-credits-close'))
    expect(onOpenChange).toHaveBeenCalledTimes(1)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
