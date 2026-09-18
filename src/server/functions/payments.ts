/**
 * Client-safe server function RPC wrappers for Midtrans payments.
 * Core implementations live in ../core/payments.ts (server-only).
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  createPaymentCore,
  getPaymentStatusCore,
  getPricingSummaryCore,
} from '../core/payments'

const createPaymentData = z.object({
  planId: z.enum(['starter', 'pro', 'power']),
  billingPeriod: z.enum(['monthly', 'yearly']),
})

const paymentStatusData = z.object({ orderId: z.string().min(1) })

export const createPaymentFn = createServerFn({ method: 'POST' })
  .validator((data: unknown) => createPaymentData.parse(data))
  .handler(({ data }) =>
    createPaymentCore({ data, request: getRequest() as Request }),
  )

export const getPaymentStatusFn = createServerFn({ method: 'GET' })
  .validator((data: unknown) => paymentStatusData.parse(data))
  .handler(({ data }) =>
    getPaymentStatusCore({ data, request: getRequest() as Request }),
  )

export const getPricingSummaryFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const request = getRequest() as Request
    return getPricingSummaryCore({ request })
  },
)
