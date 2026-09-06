import { afterEach, describe, expect, it, vi } from 'vitest'
import { getSnapJsUrl, loadSnapJs } from '../../src/lib/midtrans/snap-client'

describe('getSnapJsUrl', () => {
  it('returns sandbox and production script urls', () => {
    expect(getSnapJsUrl(false)).toBe('https://app.sandbox.midtrans.com/snap/snap.js')
    expect(getSnapJsUrl(true)).toBe('https://app.midtrans.com/snap/snap.js')
  })
})

describe('loadSnapJs', () => {
  afterEach(() => {
    document.querySelectorAll('script[data-zona-snap]').forEach((el) => el.remove())
    vi.resetModules()
    delete window.snap
  })

  it('injects exactly one snap script and resolves window.snap on load', async () => {
    const { loadSnapJs: fresh } = await import('../../src/lib/midtrans/snap-client')
    const promise = fresh('ck-1', false)
    const scripts = document.querySelectorAll('script[data-zona-snap]')
    expect(scripts).toHaveLength(1)
    const el = scripts[0] as HTMLScriptElement
    expect(el.src).toBe(getSnapJsUrl(false))
    expect(el.dataset.clientKey).toBe('ck-1')
    window.snap = { pay: () => undefined }
    el.onload?.(new Event('load'))
    const api = await promise
    expect(typeof api.pay).toBe('function')
  })

  it('resolves immediately when snap is already loaded', async () => {
    window.snap = { pay: () => undefined }
    const { loadSnapJs: fresh } = await import('../../src/lib/midtrans/snap-client')
    const api = await fresh('ck-2', true)
    expect(typeof api.pay).toBe('function')
    expect(document.querySelectorAll('script[data-zona-snap]')).toHaveLength(0)
  })
})
