import {
  PAYMENT_ORDER_ID_MAX_LENGTH,
  PAYMENT_ORDER_ID_PREFIX,
} from '../utils/constants'

export function generateOrderId(planId: string): string {
  const id = `${PAYMENT_ORDER_ID_PREFIX}${planId}-${crypto.randomUUID()}`
  return id.slice(0, PAYMENT_ORDER_ID_MAX_LENGTH)
}
