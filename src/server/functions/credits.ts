/**
 * Client-safe server function RPC wrappers.
 * Core implementations live in src/server/core/ (server-only).
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  adjustUserCreditsCore,
  getCreditBalanceCore,
  listUserCreditsCore,
  resetDevCreditsCore,
} from '../core/credits'

export const adjustUserCreditsSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().int().min(0),
  mode: z.enum(['add', 'deduct', 'set']),
  reason: z.string().optional().nullable(),
})

export const listUserCreditsSchema = z.object({
  search: z.string().optional().nullable(),
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(100).optional().default(20),
})

export const resetDevCreditsSchema = z
  .object({
    targetUserId: z.string().optional().nullable(),
  })
  .optional()

export const getCreditBalanceFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const request = getRequest()
    return getCreditBalanceCore({ request })
  },
)

export const resetDevCreditsFn = createServerFn({ method: 'POST' })
  .validator((data?: unknown) => resetDevCreditsSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const request = getRequest()
    return resetDevCreditsCore({
      request,
      targetUserId: data?.targetUserId,
    })
  })

export const adjustUserCreditsFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => adjustUserCreditsSchema.parse(data))
  .handler(async ({ data }) => {
    const request = getRequest()
    return adjustUserCreditsCore({
      request,
      data,
    })
  })

export const listUserCreditsFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => listUserCreditsSchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const request = getRequest()
    return listUserCreditsCore({
      request,
      search: data.search,
      page: data.page,
      limit: data.limit,
    })
  })
