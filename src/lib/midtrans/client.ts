import { z } from 'zod'
import { env } from '../env.server'
import { ZonaApiError } from '../utils/errors'
import { type MidtransStatus, midtransStatusSchema } from './status-schema'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/midtrans/client.ts is server-only - do not import on the client',
  )
}

const REQUEST_TIMEOUT_MS = 15_000
const MAX_ATTEMPTS = 2

const snapTokenResponseSchema = z.object({
  token: z.string().min(1),
  redirect_url: z.string().optional(),
})

export function getSnapBaseUrl(isProduction: boolean): string {
  return isProduction
    ? 'https://app.midtrans.com'
    : 'https://app.sandbox.midtrans.com'
}

export function getApiBaseUrl(isProduction: boolean): string {
  return isProduction
    ? 'https://api.midtrans.com'
    : 'https://api.sandbox.midtrans.com'
}

function getAuthorizationHeader(): string {
  return `Basic ${Buffer.from(`${env.MIDTRANS_SERVER_KEY}:`).toString('base64')}`
}

function getHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: getAuthorizationHeader(),
  }
}

function throwPaymentProviderError(details: string): never {
  throw new ZonaApiError(
    `ERR-020: Payment service is temporarily unavailable. Please try again. (${details})`,
    'ERR-020',
    502,
    true,
  )
}

async function fetchMidtrans(
  url: string,
  init: RequestInit,
  retryOn5xx: boolean,
): Promise<Response> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      if (retryOn5xx && response.status >= 500 && attempt < MAX_ATTEMPTS - 1) {
        continue
      }

      return response
    } catch {
      if (attempt === MAX_ATTEMPTS - 1) {
        return throwPaymentProviderError('Midtrans request failed')
      }
    }
  }

  return throwPaymentProviderError('Midtrans request failed')
}

export async function createSnapTransaction(params: {
  orderId: string
  grossAmount: number
}): Promise<{ token: string }> {
  const url = `${getSnapBaseUrl(env.MIDTRANS_IS_PRODUCTION === 'true')}/snap/v1/transactions`

  try {
    const response = await fetchMidtrans(
      url,
      {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          transaction_details: {
            order_id: params.orderId,
            gross_amount: params.grossAmount,
          },
        }),
      },
      false,
    )

    if (!response.ok) {
      return throwPaymentProviderError(
        `Snap create returned ${response.status}`,
      )
    }

    const payload: unknown = await response.json()
    const parsed = snapTokenResponseSchema.safeParse(payload)
    if (!parsed.success) {
      return throwPaymentProviderError('Malformed Snap create response')
    }

    return { token: parsed.data.token }
  } catch (error) {
    if (error instanceof ZonaApiError) {
      throw error
    }

    return throwPaymentProviderError('Malformed Snap create response')
  }
}

export async function getTransactionStatus(
  orderId: string,
): Promise<MidtransStatus> {
  const url = `${getApiBaseUrl(env.MIDTRANS_IS_PRODUCTION === 'true')}/v2/${encodeURIComponent(orderId)}/status`

  try {
    const response = await fetchMidtrans(
      url,
      {
        method: 'GET',
        headers: getHeaders(),
      },
      true,
    )

    if (!response.ok) {
      return throwPaymentProviderError(`Get status returned ${response.status}`)
    }

    const payload: unknown = await response.json()
    const parsed = midtransStatusSchema.safeParse(payload)
    if (!parsed.success) {
      return throwPaymentProviderError('Malformed Get Status response')
    }

    return parsed.data
  } catch (error) {
    if (error instanceof ZonaApiError) {
      throw error
    }

    return throwPaymentProviderError('Malformed Get Status response')
  }
}
