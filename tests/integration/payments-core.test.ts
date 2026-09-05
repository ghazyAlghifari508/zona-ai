/**
 * @vitest-environment node
 */
import { createHash } from 'node:crypto'
import { eq, inArray } from 'drizzle-orm'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  userId: 'pay-user-a',
  createSnapTransaction: vi.fn(),
  getTransactionStatus: vi.fn(),
}))

vi.mock('../../src/lib/midtrans/client', () => ({
  createSnapTransaction: mocks.createSnapTransaction,
  getTransactionStatus: mocks.getTransactionStatus,
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async () => ({ user: { id: mocks.userId } })),
}))

import { AppError, ZonaApiError } from '../../src/lib/utils/errors'
import { resetRateLimitForTest } from '../../src/lib/security/rate-limit'
import { PAYMENT_RECONCILE_MAX_ROWS } from '../../src/lib/utils/constants'
import { env } from '../../src/lib/env.server'
import { db } from '../../src/lib/db/index'
import { payments, users } from '../../src/lib/db/schema'
import {
  createPaymentCore,
  getPaymentStatusCore,
  getPricingSummaryCore,
  reconcilePendingPaymentsCore,
} from '../../src/server/core/payments'

const REQUEST = new Request('http://localhost:3000/pricing')
const USER_A = 'pay-user-a'
const USER_B = 'pay-user-b'

function sign(orderId: string, statusCode: string, grossAmount: string): string {
  return createHash('sha512')
    .update(orderId + statusCode + grossAmount + env.MIDTRANS_SERVER_KEY)
    .digest('hex')
}

function statusPayload(
  orderId: string,
  transactionStatus: string,
  opts: {
    fraud?: string
    grossAmount?: string
    orderIdOverride?: string
    signatureOverride?: string
    currency?: string
  } = {},
) {
  const respondedOrderId = opts.orderIdOverride ?? orderId
  const grossAmount = opts.grossAmount ?? '49000.00'
  return {
    order_id: respondedOrderId,
    status_code: '200',
    gross_amount: grossAmount,
    transaction_status: transactionStatus,
    signature_key:
      opts.signatureOverride ?? sign(respondedOrderId, '200', grossAmount),
    transaction_id: 'tx-9',
    payment_type: 'qris',
    ...(opts.fraud ? { fraud_status: opts.fraud } : {}),
    ...(opts.currency ? { currency: opts.currency } : {}),
  }
}

async function insertUser(userId: string) {
  await db.insert(users).values({
    id: userId,
    email: `${userId}@test.com`,
    name: 'A',
    credits: 100,
  })
}

async function cleanUsers() {
  await db.delete(payments).where(inArray(payments.userId, [USER_A, USER_B]))
  await db.delete(users).where(inArray(users.id, [USER_A, USER_B]))
}

async function insertRow(
  orderId: string,
  status: string,
  userId: string = mocks.userId,
) {
  await db.insert(payments).values({
    userId,
    planId: 'pro',
    billingPeriod: 'monthly',
    amountIdr: 49000,
    creditsGranted: 2000,
    status,
    orderId,
  })
}

async function rowStatus(orderId: string): Promise<string | undefined> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
  return rows[0]?.status
}

async function userBalance(userId: string): Promise<number> {
  const rows = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, userId))
  return rows[0]?.credits ?? 0
}

beforeEach(async () => {
  mocks.userId = USER_A
  resetRateLimitForTest()
  mocks.createSnapTransaction.mockReset()
  mocks.getTransactionStatus.mockReset()
  await cleanUsers()
  await insertUser(USER_A)
})

afterEach(async () => {
  await cleanUsers()
})

describe('createPaymentCore', () => {
  it('creates a creating row, gets a token, transitions to pending', async () => {
    mocks.createSnapTransaction.mockResolvedValue({ token: 'snap-tok-1' })
    const result = await createPaymentCore({
      request: REQUEST,
      data: { planId: 'pro', billingPeriod: 'monthly' },
    })
    expect(result.snapToken).toBe('snap-tok-1')
    expect(result.amountIdr).toBe(49000)
    expect(result.creditsGranted).toBe(2000)
    expect(typeof result.clientKey).toBe('string')
    expect(result.orderId).toMatch(/^zona-pro-/)

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.orderId, result.orderId))
    expect(rows[0]?.status).toBe('pending')
    expect(rows[0]?.snapToken).toBe('snap-tok-1')
    expect(rows[0]?.userId).toBe(mocks.userId)
  })

  it('marks the row failed and rethrows ERR-020 when the provider errors', async () => {
    mocks.createSnapTransaction.mockRejectedValue(
      new ZonaApiError(
        'ERR-020: Payment service is temporarily unavailable. Please try again. (boom)',
        'ERR-020',
        502,
        true,
      ),
    )
    const failed = await createPaymentCore({
      request: REQUEST,
      data: { planId: 'ultra', billingPeriod: 'yearly' },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failed).toBeInstanceOf(ZonaApiError)
    expect(failed).toMatchObject({ code: 'ERR-020' })

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.planId, 'ultra'))
    const failedRows = rows.filter((r) => r.status === 'failed')
    expect(failedRows.length).toBeGreaterThanOrEqual(1)
    expect(failedRows[0]?.snapToken).toBeNull()
  })

  it('rejects free plan and invalid billing period with typed 400', async () => {
    const freePlan = await createPaymentCore({
      request: REQUEST,
      data: { planId: 'free', billingPeriod: 'monthly' },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(freePlan).toBeInstanceOf(AppError)
    expect(freePlan).toMatchObject({ status: 400 })

    const badPeriod = await createPaymentCore({
      request: REQUEST,
      data: { planId: 'pro', billingPeriod: 'weekly' },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(badPeriod).toBeInstanceOf(AppError)
    expect(badPeriod).toMatchObject({ status: 400 })
  })
})

describe('getPaymentStatusCore', () => {
  it('returns terminal rows without contacting the provider', async () => {
    await insertRow('zona-pro-term-1', 'paid')
    const result = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId: 'zona-pro-term-1' },
    })
    expect(result.status).toBe('paid')
    expect(mocks.getTransactionStatus).not.toHaveBeenCalled()
  })

  it('settles pending to paid with an exact safe shape on valid settlement', async () => {
    const orderId = 'zona-pro-poll-1'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'settlement'),
    )

    const result = await getPaymentStatusCore({ request: REQUEST, data: { orderId } })
    expect(result).toEqual({
      status: 'paid',
      creditsGranted: 2000,
      balanceAfter: 2100,
      paymentType: 'qris',
    })
    expect(JSON.stringify(result)).not.toContain(env.MIDTRANS_SERVER_KEY)
    expect(await userBalance(mocks.userId)).toBe(2100)
  })

  it('throws ERR-021 and never settles on an invalid signature', async () => {
    const orderId = 'zona-pro-poll-2'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'settlement', {
        signatureOverride: 'b'.repeat(128),
      }),
    )
    const failure = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(ZonaApiError)
    expect(failure).toMatchObject({ code: 'ERR-021' })
    expect(await rowStatus(orderId)).toBe('pending')
    expect(await userBalance(mocks.userId)).toBe(100)
  })

  it('keeps the row pending on provider failure', async () => {
    const orderId = 'zona-pro-poll-3'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockRejectedValue(
      new ZonaApiError(
        'ERR-020: Payment service is temporarily unavailable. Please try again. (down)',
        'ERR-020',
        502,
        true,
      ),
    )
    const result = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    })
    expect(result).toEqual({ status: 'pending' })
    expect(await rowStatus(orderId)).toBe('pending')
  })

  it('transitions pending to expired on expire status with valid signature', async () => {
    const orderId = 'zona-pro-poll-4'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'expire'),
    )
    const result = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    })
    expect(result).toEqual({ status: 'expired' })
    expect(await rowStatus(orderId)).toBe('expired')
  })

  it('blocks other users from polling an order (404)', async () => {
    const orderId = 'zona-pro-own-1'
    await insertRow(orderId, 'pending')
    mocks.userId = USER_B
    await insertUser(USER_B)
    const failure = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(AppError)
    expect(failure).toMatchObject({ status: 404 })
  })

  it('throws ERR-021 when the provider order id does not match the local order', async () => {
    const orderId = 'zona-pro-poll-5'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'settlement', {
        orderIdOverride: 'zona-pro-attacker-1',
      }),
    )
    const failure = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(ZonaApiError)
    expect(failure).toMatchObject({ code: 'ERR-021' })
    expect(await rowStatus(orderId)).toBe('pending')
    expect(await userBalance(mocks.userId)).toBe(100)
  })

  it('throws ERR-021 when gross_amount does not represent the stored amount', async () => {
    const orderId = 'zona-pro-poll-6'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'settlement', { grossAmount: '1000.00' }),
    )
    const failure = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(ZonaApiError)
    expect(failure).toMatchObject({ code: 'ERR-021' })
    expect(await rowStatus(orderId)).toBe('pending')
    expect(await userBalance(mocks.userId)).toBe(100)
  })

  it('throws ERR-021 when a present currency is not IDR', async () => {
    const orderId = 'zona-pro-poll-7'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'settlement', { currency: 'USD' }),
    )
    const failure = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    }).then(
      () => null,
      (error: unknown) => error,
    )
    expect(failure).toBeInstanceOf(ZonaApiError)
    expect(failure).toMatchObject({ code: 'ERR-021' })
    expect(await rowStatus(orderId)).toBe('pending')
    expect(await userBalance(mocks.userId)).toBe(100)
  })

  it('leaves the row pending on out-of-scope refund status without writing', async () => {
    const orderId = 'zona-pro-poll-8'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'refund'),
    )
    const result = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    })
    expect(result).toEqual({ status: 'pending' })
    expect(await rowStatus(orderId)).toBe('pending')
    expect(await userBalance(mocks.userId)).toBe(100)
  })

  it('leaves the row pending when fraud_status denies a capture', async () => {
    const orderId = 'zona-pro-poll-9'
    await insertRow(orderId, 'pending')
    mocks.getTransactionStatus.mockResolvedValue(
      statusPayload(orderId, 'capture', { fraud: 'deny' }),
    )
    const result = await getPaymentStatusCore({
      request: REQUEST,
      data: { orderId },
    })
    expect(result).toEqual({ status: 'pending' })
    expect(await rowStatus(orderId)).toBe('pending')
    expect(await userBalance(mocks.userId)).toBe(100)
  })
})

describe('reconcilePendingPaymentsCore', () => {
  it('settles what it can and isolates a failing row', async () => {
    await insertRow('zona-pro-rec-1', 'pending')
    await insertRow('zona-pro-rec-2', 'pending')
    mocks.getTransactionStatus.mockImplementation(async (orderId: string) => {
      if (orderId === 'zona-pro-rec-2') {
        throw new ZonaApiError(
          'ERR-020: Payment service is temporarily unavailable. Please try again. (down)',
          'ERR-020',
          502,
          true,
        )
      }
      return statusPayload(orderId, 'settlement')
    })

    const result = await reconcilePendingPaymentsCore({ request: REQUEST })
    expect(result).toEqual({ reconciled: 1 })
    expect(await rowStatus('zona-pro-rec-1')).toBe('paid')
    expect(await rowStatus('zona-pro-rec-2')).toBe('pending')
  })

  it('processes newest rows first within the reconcile bound', async () => {
    const total = PAYMENT_RECONCILE_MAX_ROWS + 2
    const base = Date.now()
    for (let i = 0; i < total; i += 1) {
      await db.insert(payments).values({
        userId: mocks.userId,
        planId: 'pro',
        billingPeriod: 'monthly',
        amountIdr: 49000,
        creditsGranted: 2000,
        status: 'pending',
        orderId: `zona-pro-rec-b-${i}`,
        createdAt: new Date(base + i * 1000),
      })
    }
    mocks.getTransactionStatus.mockImplementation(async (orderId: string) =>
      statusPayload(orderId, 'settlement'),
    )

    const result = await reconcilePendingPaymentsCore({ request: REQUEST })
    expect(result).toEqual({ reconciled: PAYMENT_RECONCILE_MAX_ROWS })
    expect(await rowStatus('zona-pro-rec-b-0')).toBe('pending')
    expect(await rowStatus('zona-pro-rec-b-1')).toBe('pending')
    expect(await rowStatus(`zona-pro-rec-b-${total - 1}`)).toBe('paid')
  })
})

describe('getPricingSummaryCore', () => {
  it('returns free when no paid purchases exist and reconciles pending rows', async () => {
    await insertRow('zona-pro-sum-1', 'pending')
    mocks.getTransactionStatus.mockRejectedValue(
      new ZonaApiError(
        'ERR-020: Payment service is temporarily unavailable. Please try again. (offline)',
        'ERR-020',
        502,
        true,
      ),
    )
    const summary = await getPricingSummaryCore({ request: REQUEST })
    expect(summary).toEqual({ balance: 100, activePlanId: 'free' })
    expect(await rowStatus('zona-pro-sum-1')).toBe('pending')
  })

  it('derives activePlanId from the latest paid payment', async () => {
    await db.insert(payments).values({
      userId: mocks.userId,
      planId: 'pro',
      billingPeriod: 'monthly',
      amountIdr: 49000,
      creditsGranted: 2000,
      status: 'paid',
      orderId: 'zona-pro-badge-1',
      settledAt: new Date('2026-01-01T00:00:00Z'),
    })
    await db.insert(payments).values({
      userId: mocks.userId,
      planId: 'ultra',
      billingPeriod: 'monthly',
      amountIdr: 149000,
      creditsGranted: 10000,
      status: 'paid',
      orderId: 'zona-ultra-badge-1',
      settledAt: new Date('2026-02-01T00:00:00Z'),
    })
    const summary = await getPricingSummaryCore({ request: REQUEST })
    expect(summary.activePlanId).toBe('ultra')
    expect(summary.balance).toBe(100)
  })
})
