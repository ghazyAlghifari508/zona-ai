import { z } from 'zod'

export const midtransStatusSchema = z.object({
  order_id: z.string().min(1),
  status_code: z.string().min(1),
  gross_amount: z.string().min(1),
  transaction_status: z.string().min(1),
  signature_key: z.string().min(1),
  transaction_id: z.string().optional(),
  payment_type: z.string().optional(),
  fraud_status: z.string().optional(),
  settlement_time: z.string().optional(),
  status_message: z.string().optional(),
  currency: z.string().optional(),
})

export type MidtransStatus = z.infer<typeof midtransStatusSchema>

export type InternalPaymentStatus =
  | 'paid'
  | 'pending'
  | 'failed'
  | 'cancelled'
  | 'expired'

const INTERNAL_STATUS_MAP: Record<string, InternalPaymentStatus> = {
  capture: 'paid',
  settlement: 'paid',
  pending: 'pending',
  deny: 'failed',
  cancel: 'cancelled',
  expire: 'expired',
}

export function mapMidtransStatus(
  status: MidtransStatus,
): InternalPaymentStatus {
  const mapped = INTERNAL_STATUS_MAP[status.transaction_status]
  if (!mapped) {
    throw new Error(
      `Unknown Midtrans transaction_status: ${status.transaction_status}`,
    )
  }
  return mapped
}
