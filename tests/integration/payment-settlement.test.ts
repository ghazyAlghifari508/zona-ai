/**
 * @vitest-environment node
 */
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/index'
import { creditTransactions, payments, users } from '../../src/lib/db/schema'
import { settlePaymentIfPending } from '../../src/server/core/payments'

const USER_ID = 'settle-user-a'

async function getBalance(userId: string): Promise<number> {
  const rows = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId))
  return rows[0]?.credits ?? 0
}

describe('settlePaymentIfPending', () => {
  beforeEach(async () => {
    await db.delete(users).where(eq(users.id, USER_ID))
    await db.insert(users).values({
      id: USER_ID,
      email: 'settle-a@test.com',
      name: 'A',
      credits: 100,
    })
  })

  afterEach(async () => {
    await db.delete(users).where(eq(users.id, USER_ID))
  })

  async function insertPendingPayment(
    orderId: string,
    credits: number,
    status: string,
  ) {
    await db.insert(payments).values({
      userId: USER_ID,
      planId: 'pro',
      billingPeriod: 'monthly',
      amountIdr: 49000,
      creditsGranted: credits,
      status,
      orderId,
    })
  }

  it('grants credits exactly once and records a purchase transaction', async () => {
    await insertPendingPayment('zona-pro-settle-1', 2000, 'pending')
    const first = await settlePaymentIfPending({
      orderId: 'zona-pro-settle-1',
      midtransTransactionId: 'tx-1',
      paymentType: 'qris',
      settledAt: new Date(),
    })
    expect(first).toEqual({ creditsGranted: 2000, balanceAfter: 2100 })
    expect(await getBalance(USER_ID)).toBe(2100)

    const second = await settlePaymentIfPending({
      orderId: 'zona-pro-settle-1',
      settledAt: new Date(),
    })
    expect(second).toBeNull()
    expect(await getBalance(USER_ID)).toBe(2100)

    const txs = await db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.userId, USER_ID))
    expect(txs).toHaveLength(1)
    expect(txs[0]?.type).toBe('purchase')
    expect(txs[0]?.amount).toBe(2000)
    expect(txs[0]?.balanceAfter).toBe(2100)
  })

  it('never settles a terminal payment row', async () => {
    await insertPendingPayment('zona-pro-settle-2', 2000, 'failed')
    const result = await settlePaymentIfPending({
      orderId: 'zona-pro-settle-2',
      settledAt: new Date(),
    })
    expect(result).toBeNull()
    expect(await getBalance(USER_ID)).toBe(100)
  })

  it('settles rows stuck in creating', async () => {
    await insertPendingPayment('zona-pro-settle-3', 2000, 'creating')
    const result = await settlePaymentIfPending({
      orderId: 'zona-pro-settle-3',
      settledAt: new Date(),
    })
    expect(result).toEqual({ creditsGranted: 2000, balanceAfter: 2100 })
  })
})
