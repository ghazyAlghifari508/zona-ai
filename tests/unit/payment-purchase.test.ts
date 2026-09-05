import { describe, expect, it } from 'vitest'
import { generateOrderId } from '../../src/lib/midtrans/order-id'
import {
  isBillingPeriod,
  isPurchasablePlan,
  resolvePurchase,
} from '../../src/lib/pricing/plans'
import {
  PAYMENT_ORDER_ID_MAX_LENGTH,
  PAYMENT_ORDER_ID_PREFIX,
} from '../../src/lib/utils/constants'

describe('purchase resolution', () => {
  it('resolves pro monthly from plans.ts values', () => {
    expect(resolvePurchase('pro', 'monthly')).toEqual({
      planId: 'pro',
      billingPeriod: 'monthly',
      amountIdr: 49000,
      creditsGranted: 2000,
    })
  })

  it('resolves yearly as 12x monthly credits and yearly price', () => {
    expect(resolvePurchase('pro', 'yearly')).toEqual({
      planId: 'pro',
      billingPeriod: 'yearly',
      amountIdr: 470000,
      creditsGranted: 24000,
    })
    expect(resolvePurchase('ultra', 'yearly').creditsGranted).toBe(120000)
  })

  it('guards purchasable plans and billing periods', () => {
    expect(isPurchasablePlan('pro')).toBe(true)
    expect(isPurchasablePlan('ultra')).toBe(true)
    expect(isPurchasablePlan('free')).toBe(false)
    expect(isPurchasablePlan('nonsense')).toBe(false)
    expect(isBillingPeriod('monthly')).toBe(true)
    expect(isBillingPeriod('yearly')).toBe(true)
    expect(isBillingPeriod('weekly')).toBe(false)
  })
})

describe('order id generation', () => {
  it('uses the prefix, plan segment, and allowed charset', () => {
    const id = generateOrderId('pro')
    expect(id.startsWith(`${PAYMENT_ORDER_ID_PREFIX}pro-`)).toBe(true)
    expect(id.length).toBeLessThanOrEqual(PAYMENT_ORDER_ID_MAX_LENGTH)
    expect(id).toMatch(/^[A-Za-z0-9._~-]+$/)
  })

  it('generates unique ids', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => generateOrderId('ultra')),
    )
    expect(ids.size).toBe(50)
  })
})
