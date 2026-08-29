/**
 * Client-safe server function RPC wrappers.
 * Core implementations live in src/server/core/ (server-only).
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { resetDevCreditsCore } from '../core/credits'

export const resetDevCreditsFn = createServerFn({ method: 'POST' }).handler(
  async () => {
    const request = getRequest() as Request
    return resetDevCreditsCore({ request })
  },
)
