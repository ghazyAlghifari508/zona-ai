/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { env, envSchema } from '../../src/lib/env.server'
import {
  createSnapTransaction,
  getApiBaseUrl,
  getSnapBaseUrl,
  getTransactionStatus,
} from '../../src/lib/midtrans/client'
import { ZonaApiError } from '../../src/lib/utils/errors'

type FetchHandler = (
  url: string,
  init: RequestInit,
) => Response | Promise<Response>

const statusPayload = {
  order_id: 'zona-pro-test',
  status_code: '200',
  gross_amount: '49000.00',
  transaction_status: 'settlement',
  signature_key: 'a'.repeat(128),
}

function fetchMock(handler: FetchHandler) {
  return vi.fn<typeof fetch>(async (input, init) =>
    handler(String(input), init ?? {}),
  )
}

async function expectErr020(promise: Promise<unknown>): Promise<void> {
  try {
    await promise
    throw new Error('Expected Midtrans request to reject')
  } catch (error) {
    expect(error).toBeInstanceOf(ZonaApiError)
    if (!(error instanceof ZonaApiError)) {
      throw error
    }
    expect(error.code).toBe('ERR-020')
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Midtrans environment', () => {
  const validInput = {
    ...process.env,
    MIDTRANS_SERVER_KEY: 'SB-Mid-server-test-key',
    MIDTRANS_CLIENT_KEY: 'SB-Mid-client-test-key',
  }

  it('requires both Midtrans keys', () => {
    const { MIDTRANS_SERVER_KEY: _serverKey, ...withoutServerKey } = validInput
    const { MIDTRANS_CLIENT_KEY: _clientKey, ...withoutClientKey } = validInput

    expect(envSchema.safeParse(withoutServerKey).success).toBe(false)
    expect(envSchema.safeParse(withoutClientKey).success).toBe(false)
  })

  it('defaults to sandbox and rejects invalid environment switches', () => {
    const {
      MIDTRANS_IS_PRODUCTION: _isProduction,
      ...withoutEnvironmentSwitch
    } = validInput
    const parsed = envSchema.parse(withoutEnvironmentSwitch)

    expect(parsed.MIDTRANS_IS_PRODUCTION).toBe('false')
    expect(
      envSchema.safeParse({
        ...validInput,
        MIDTRANS_IS_PRODUCTION: 'sandbox',
      }).success,
    ).toBe(false)
  })
})

describe('base URL derivation', () => {
  it('returns the sandbox and production hosts', () => {
    expect(getSnapBaseUrl(false)).toBe('https://app.sandbox.midtrans.com')
    expect(getSnapBaseUrl(true)).toBe('https://app.midtrans.com')
    expect(getApiBaseUrl(false)).toBe('https://api.sandbox.midtrans.com')
    expect(getApiBaseUrl(true)).toBe('https://api.midtrans.com')
  })
})

describe('createSnapTransaction', () => {
  it('posts the documented payload with Basic Auth and returns only the token', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const fetchFn = fetchMock((url, init) => {
      expect(url).toBe(
        `${getSnapBaseUrl(env.MIDTRANS_IS_PRODUCTION === 'true')}/snap/v1/transactions`,
      )
      expect(init.method).toBe('POST')
      expect(new Headers(init.headers).get('Accept')).toBe('application/json')
      expect(new Headers(init.headers).get('Content-Type')).toBe(
        'application/json',
      )
      expect(new Headers(init.headers).get('Authorization')).toBe(
        `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
      )
      const body: unknown = JSON.parse(String(init.body))
      expect(body).toEqual({
        transaction_details: {
          order_id: 'zona-pro-test',
          gross_amount: 49_000,
        },
      })
      return new Response(
        JSON.stringify({
          token: 'snap-token-1',
          redirect_url: 'https://app.sandbox.midtrans.com/snap/redirect',
        }),
        { status: 201 },
      )
    })
    vi.stubGlobal('fetch', fetchFn)

    const result = await createSnapTransaction({
      orderId: 'zona-pro-test',
      grossAmount: 49_000,
    })

    expect(result).toEqual({ token: 'snap-token-1' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(timeoutSpy).toHaveBeenCalledOnce()
    expect(timeoutSpy).toHaveBeenCalledWith(15_000)
  })

  it('does not retry a received 4xx response', async () => {
    const fetchFn = fetchMock(() => new Response('denied', { status: 401 }))
    vi.stubGlobal('fetch', fetchFn)

    await expectErr020(
      createSnapTransaction({
        orderId: 'zona-pro-test',
        grossAmount: 49_000,
      }),
    )

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('does not retry a received 5xx response', async () => {
    const fetchFn = fetchMock(
      () => new Response('provider unavailable', { status: 503 }),
    )
    vi.stubGlobal('fetch', fetchFn)

    await expectErr020(
      createSnapTransaction({
        orderId: 'zona-pro-test',
        grossAmount: 49_000,
      }),
    )

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries once after a network error', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'snap-token-2' }), {
          status: 201,
        }),
      )
    vi.stubGlobal('fetch', fetchFn)

    const result = await createSnapTransaction({
      orderId: 'zona-pro-test',
      grossAmount: 49_000,
    })

    expect(result).toEqual({ token: 'snap-token-2' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('retries once after a timeout', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ token: 'snap-token-3' }), {
          status: 201,
        }),
      )
    vi.stubGlobal('fetch', fetchFn)

    const result = await createSnapTransaction({
      orderId: 'zona-pro-test',
      grossAmount: 49_000,
    })

    expect(result).toEqual({ token: 'snap-token-3' })
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('maps exhausted network retries to ERR-020', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchFn)

    await expectErr020(
      createSnapTransaction({
        orderId: 'zona-pro-test',
        grossAmount: 49_000,
      }),
    )

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['invalid JSON', new Response('{', { status: 201 })],
    [
      'invalid token payload',
      new Response(JSON.stringify({ token: '' }), { status: 201 }),
    ],
  ])('maps %s to ERR-020 without retrying', async (_case, response) => {
    const fetchFn = fetchMock(() => response)
    vi.stubGlobal('fetch', fetchFn)

    await expectErr020(
      createSnapTransaction({
        orderId: 'zona-pro-test',
        grossAmount: 49_000,
      }),
    )

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

describe('getTransactionStatus', () => {
  it('gets and parses status using an encoded order ID and Basic Auth', async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')
    const orderId = 'zona pro/test'
    const fetchFn = fetchMock((url, init) => {
      expect(url).toBe(
        `${getApiBaseUrl(env.MIDTRANS_IS_PRODUCTION === 'true')}/v2/${encodeURIComponent(orderId)}/status`,
      )
      expect(init.method).toBe('GET')
      expect(new Headers(init.headers).get('Authorization')).toBe(
        `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`,
      )
      return new Response(
        JSON.stringify({ ...statusPayload, order_id: orderId }),
        {
          status: 200,
        },
      )
    })
    vi.stubGlobal('fetch', fetchFn)

    const parsed = await getTransactionStatus(orderId)

    expect(parsed).toEqual({ ...statusPayload, order_id: orderId })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(timeoutSpy).toHaveBeenCalledOnce()
    expect(timeoutSpy).toHaveBeenCalledWith(15_000)
  })

  it('does not retry a received 4xx response', async () => {
    const fetchFn = fetchMock(() => new Response('not found', { status: 404 }))
    vi.stubGlobal('fetch', fetchFn)

    await expectErr020(getTransactionStatus('zona-pro-test'))

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('retries once after a received 5xx response', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(statusPayload), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchFn)

    const parsed = await getTransactionStatus('zona-pro-test')

    expect(parsed.transaction_status).toBe('settlement')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('retries once after a network error', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(statusPayload), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchFn)

    const parsed = await getTransactionStatus('zona-pro-test')

    expect(parsed.transaction_status).toBe('settlement')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('retries once after a timeout', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(statusPayload), { status: 200 }),
      )
    vi.stubGlobal('fetch', fetchFn)

    const parsed = await getTransactionStatus('zona-pro-test')

    expect(parsed.transaction_status).toBe('settlement')
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('maps exhausted 5xx retries to ERR-020', async () => {
    const fetchFn = fetchMock(
      () => new Response('provider unavailable', { status: 503 }),
    )
    vi.stubGlobal('fetch', fetchFn)

    await expectErr020(getTransactionStatus('zona-pro-test'))

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it('maps exhausted network retries to ERR-020', async () => {
    const fetchFn = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchFn)

    await expectErr020(getTransactionStatus('zona-pro-test'))

    expect(fetchFn).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['invalid JSON', new Response('{', { status: 200 })],
    [
      'invalid status payload',
      new Response(JSON.stringify({ ...statusPayload, signature_key: '' }), {
        status: 200,
      }),
    ],
  ])('maps %s to ERR-020 without retrying', async (_case, response) => {
    const fetchFn = fetchMock(() => response)
    vi.stubGlobal('fetch', fetchFn)

    await expectErr020(getTransactionStatus('zona-pro-test'))

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})
