/**
 * Client-safe server function RPC wrappers.
 * Core implementations live in src/server/core/ (server-only).
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getCreditBalanceCore, resetDevCreditsCore } from '../core/credits'

export const getCreditBalanceFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const request = getRequest() as Request
    return getCreditBalanceCore({ request })
  },
)

export const resetDevCreditsFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const request = getRequest() as Request
    return resetDevCreditsCore({ request })
  },
)
