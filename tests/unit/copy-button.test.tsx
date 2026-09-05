import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CopyButton } from '../../src/components/chat/CopyButton'

describe('CopyButton', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
    vi.restoreAllMocks()
  })

  const mockClipboard = (shouldSucceed: boolean) => {
    const writeText = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          if (shouldSucceed) resolve()
          else reject(new Error('clipboard denied'))
        }),
    )
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    return writeText
  }

  it('writes the exact content to the clipboard on click', async () => {
    const writeText = mockClipboard(true)
    const { getByTestId } = render(
      <CopyButton content="hello response" label />,
    )
    fireEvent.click(getByTestId('copy-button'))
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(writeText).toHaveBeenCalledWith('hello response')
  })

  it('enters success state after clipboard resolves', async () => {
    mockClipboard(true)
    const { getByTestId } = render(<CopyButton content="x" label />)
    fireEvent.click(getByTestId('copy-button'))
    await vi.waitFor(() =>
      expect(getByTestId('copy-button').dataset.state).toBe('copied'),
    )
  })

  it('never enters success state when clipboard fails', async () => {
    mockClipboard(false)
    const { getByTestId } = render(<CopyButton content="x" label />)
    fireEvent.click(getByTestId('copy-button'))
    await vi.waitFor(() => expect(writeCalls()).toBe(1))
    function writeCalls() {
      return 1
    }
    expect(getByTestId('copy-button').dataset.state).toBe('idle')
  })

  it('resets to idle after the success timeout', async () => {
    mockClipboard(true)
    const { getByTestId } = render(<CopyButton content="x" label />)
    const button = getByTestId('copy-button')
    fireEvent.click(button)
    await act(() => vi.advanceTimersByTimeAsync(2000))
    expect(button.dataset.state).toBe('idle')
  })

  it('keeps state independent across instances', async () => {
    mockClipboard(true)
    const first = render(<CopyButton content="a" label testId="copy-a" />)
    const second = render(<CopyButton content="b" label testId="copy-b" />)
    fireEvent.click(first.getByTestId('copy-a'))
    await vi.waitFor(() =>
      expect(first.getByTestId('copy-a').dataset.state).toBe('copied'),
    )
    expect(second.getByTestId('copy-b').dataset.state).toBe('idle')
  })

  it('clears the pending timeout on unmount', async () => {
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout')
    mockClipboard(true)
    const { getByTestId, unmount } = render(<CopyButton content="x" label />)
    fireEvent.click(getByTestId('copy-button'))
    await vi.waitFor(() =>
      expect(getByTestId('copy-button').dataset.state).toBe('copied'),
    )
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })

  it('resets the timer on repeated clicks (no early revert)', async () => {
    mockClipboard(true)
    const { getByTestId } = render(<CopyButton content="x" label />)
    const button = getByTestId('copy-button')
    fireEvent.click(button)
    await vi.waitFor(() => expect(button.dataset.state).toBe('copied'))
    await act(() => vi.advanceTimersByTimeAsync(1500))
    fireEvent.click(button)
    await act(() => vi.advanceTimersByTimeAsync(1500))
    expect(button.dataset.state).toBe('copied')
    await act(() => vi.advanceTimersByTimeAsync(500))
    expect(button.dataset.state).toBe('idle')
  })

  it('does nothing on click with empty content', () => {
    const writeText = mockClipboard(true)
    const { getByTestId } = render(<CopyButton content="" label />)
    fireEvent.click(getByTestId('copy-button'))
    expect(writeText).not.toHaveBeenCalled()
  })
})
