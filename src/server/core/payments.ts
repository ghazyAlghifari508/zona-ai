/**
 * Server-only payment settlement primitive.
 * NEVER import from client code.
 */
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getCreditBalance } from '../../lib/ai/credits'
import { getAuthSession } from '../../lib/auth/session'
import { db } from '../../lib/db/index'
import { creditTransactions, payments, users } from '../../lib/db/schema'
import { env } from '../../lib/env.server'
import {
  createSnapTransaction,
  getTransactionStatus,
} from '../../lib/midtrans/client'
import { generateOrderId } from '../../lib/midtrans/order-id'
import { verifyStatusSignature } from '../../lib/midtrans/signature'
import {
  type InternalPaymentStatus,
  mapMidtransStatus,
} from '../../lib/midtrans/status-schema'
import {
  isBillingPeriod,
  isPurchasablePlan,
  type PurchasablePlanId,
  resolvePurchase,
} from '../../lib/pricing/plans'
import { enforceRateLimit } from '../../lib/security/rate-limit'
import {
  PAYMENT_RECONCILE_MAX_ROWS,
  RATE_LIMIT_PAYMENT_PER_MINUTE,
  RATE_LIMIT_PAYMENT_STATUS_PER_MINUTE,
  RATE_LIMIT_WINDOW_MS,
} from '../../lib/utils/constants'
import { AppError, throwZonaError, ZonaApiError } from '../../lib/utils/errors'

export async function settlePaymentIfPending(params: {
  orderId: string
  midtransTransactionId?: string
  paymentType?: string
  settledAt: Date
}): Promise<{ creditsGranted: number; balanceAfter: number } | null> {
  return db.transaction(async (tx) => {
    const updated = await tx
      .update(payments)
      .set({
        status: 'paid',
        settledAt: params.settledAt,
        midtransTransactionId: params.midtransTransactionId,
        paymentType: params.paymentType,
      })
      .where(
        and(
          eq(payments.orderId, params.orderId),
          inArray(payments.status, ['creating', 'pending']),
        ),
      )
      .returning()
    const settled = updated[0]
    if (settled === undefined) return null
    const balances = await tx
      .update(users)
      .set({ credits: sql`${users.credits} + ${settled.creditsGranted}` })
      .where(eq(users.id, settled.userId))
      .returning({ credits: users.credits })
    const balanceAfter = balances[0]?.credits ?? 0
    await tx.insert(creditTransactions).values({
      userId: settled.userId,
      amount: settled.creditsGranted,
      type: 'purchase',
      balanceAfter,
      description: `Purchase ${settled.planId} ${settled.billingPeriod} (${settled.orderId})`,
    })
    return { creditsGranted: settled.creditsGranted, balanceAfter }
  })
}

const createPaymentInput = z.object({
  planId: z.string(),
  billingPeriod: z.string(),
})
const paymentStatusInput = z.object({ orderId: z.string().min(1) })

const TERMINAL_STATUSES: readonly string[] = [
  'paid',
  'failed',
  'cancelled',
  'expired',
]

type PaymentRow = typeof payments.$inferSelect

async function loadRow(orderId: string): Promise<PaymentRow | undefined> {
  const rows = await db
    .select()
    .from(payments)
    .where(eq(payments.orderId, orderId))
  return rows[0]
}

function grossAmountRepresentsIdr(raw: string, amountIdr: number): boolean {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed === amountIdr
}

export async function createPaymentCore(params: {
  request: Request
  data: { planId: string; billingPeriod: string }
}): Promise<{
  orderId: string
  snapToken: string
  clientKey: string
  isProduction: boolean
  amountIdr: number
  creditsGranted: number
}> {
  const session = await getAuthSession(params.request)
  enforceRateLimit({
    key: `payment:create:${session.user.id}`,
    limit: RATE_LIMIT_PAYMENT_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })
  const input = createPaymentInput.parse(params.data)
  if (
    !isPurchasablePlan(input.planId) ||
    !isBillingPeriod(input.billingPeriod)
  ) {
    throw new AppError('Invalid plan or billing period', 400)
  }
  const resolved = resolvePurchase(input.planId, input.billingPeriod)
  const orderId = generateOrderId(input.planId)
  const inserted = await db
    .insert(payments)
    .values({
      userId: session.user.id,
      planId: resolved.planId,
      billingPeriod: resolved.billingPeriod,
      amountIdr: resolved.amountIdr,
      creditsGranted: resolved.creditsGranted,
      status: 'creating',
      orderId,
    })
    .returning()
  const row = inserted[0]
  if (row === undefined) {
    throw new AppError('Failed to create payment', 500)
  }
  try {
    const snap = await createSnapTransaction({
      orderId,
      grossAmount: resolved.amountIdr,
    })
    await db
      .update(payments)
      .set({ status: 'pending', snapToken: snap.token })
      .where(eq(payments.id, row.id))
    return {
      orderId,
      snapToken: snap.token,
      clientKey: env.MIDTRANS_CLIENT_KEY,
      isProduction: env.MIDTRANS_IS_PRODUCTION === 'true',
      amountIdr: resolved.amountIdr,
      creditsGranted: resolved.creditsGranted,
    }
  } catch (error) {
    await db
      .update(payments)
      .set({ status: 'failed' })
      .where(and(eq(payments.id, row.id), eq(payments.status, 'creating')))
    throw error
  }
}

async function applyMidtransStatus(row: PaymentRow): Promise<{
  row: PaymentRow
  settlement: { creditsGranted: number; balanceAfter: number } | null
}> {
  const status = await getTransactionStatus(row.orderId)
  const signatureValid = await verifyStatusSignature({
    orderId: status.order_id,
    statusCode: status.status_code,
    grossAmountRaw: status.gross_amount,
    serverKey: env.MIDTRANS_SERVER_KEY,
    signatureKey: status.signature_key,
  })
  if (!signatureValid) throwZonaError('ERR-021')
  if (status.order_id !== row.orderId) throwZonaError('ERR-021')
  if (!grossAmountRepresentsIdr(status.gross_amount, row.amountIdr)) {
    throwZonaError('ERR-021')
  }
  if (status.currency !== undefined && status.currency !== 'IDR') {
    throwZonaError('ERR-021')
  }
  let mapped: InternalPaymentStatus
  try {
    mapped = mapMidtransStatus(status)
  } catch {
    return { row, settlement: null }
  }
  if (mapped === 'paid') {
    if (status.fraud_status && status.fraud_status !== 'accept') {
      return { row, settlement: null }
    }
    const settledAt = status.settlement_time
      ? new Date(`${status.settlement_time.replace(' ', 'T')}+07:00`)
      : new Date()
    const settlement = await settlePaymentIfPending({
      orderId: row.orderId,
      midtransTransactionId: status.transaction_id,
      paymentType: status.payment_type,
      settledAt,
    })
    const fresh = (await loadRow(row.orderId)) ?? row
    return { row: fresh, settlement }
  }
  const updated = await db
    .update(payments)
    .set({ status: mapped })
    .where(
      and(
        eq(payments.orderId, row.orderId),
        inArray(payments.status, ['creating', 'pending']),
      ),
    )
    .returning()
  return { row: updated[0] ?? row, settlement: null }
}

export async function getPaymentStatusCore(params: {
  request: Request
  data: { orderId: string }
}): Promise<{
  status: string
  creditsGranted?: number
  balanceAfter?: number
  paymentType?: string
}> {
  const session = await getAuthSession(params.request)
  enforceRateLimit({
    key: `payment:status:${session.user.id}`,
    limit: RATE_LIMIT_PAYMENT_STATUS_PER_MINUTE,
    windowMs: RATE_LIMIT_WINDOW_MS,
  })
  const input = paymentStatusInput.parse(params.data)
  const row = await loadRow(input.orderId)
  if (!row || row.userId !== session.user.id) {
    throw new AppError('Payment not found', 404)
  }
  if (TERMINAL_STATUSES.includes(row.status)) {
    return { status: row.status }
  }
  try {
    const applied = await applyMidtransStatus(row)
    if (applied.settlement) {
      return {
        status: 'paid',
        creditsGranted: applied.settlement.creditsGranted,
        balanceAfter: applied.settlement.balanceAfter,
        paymentType: applied.row.paymentType ?? undefined,
      }
    }
    return { status: applied.row.status }
  } catch (error) {
    if (error instanceof ZonaApiError && error.code === 'ERR-021') throw error
    return { status: row.status }
  }
}

export async function reconcilePendingPaymentsCore(params: {
  request: Request
}): Promise<{ reconciled: number }> {
  const session = await getAuthSession(params.request)
  const pending = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.userId, session.user.id), eq(payments.status, 'pending')),
    )
    .orderBy(desc(payments.createdAt))
    .limit(PAYMENT_RECONCILE_MAX_ROWS)
  let reconciled = 0
  for (const row of pending) {
    try {
      const before = row.status
      const applied = await applyMidtransStatus(row)
      if (applied.row.status !== before) reconciled += 1
    } catch {
      // isolated: one bad row never fails the rest
    }
  }
  return { reconciled }
}

export async function getPricingSummaryCore(params: {
  request: Request
}): Promise<{ balance: number; activePlanId: 'free' | PurchasablePlanId }> {
  const session = await getAuthSession(params.request)
  await reconcilePendingPaymentsCore(params)
  const balance = await getCreditBalance(session.user.id)
  const paid = await db
    .select({ planId: payments.planId })
    .from(payments)
    .where(
      and(eq(payments.userId, session.user.id), eq(payments.status, 'paid')),
    )
    .orderBy(desc(payments.settledAt))
    .limit(1)
  const latestPlanId: string = paid[0]?.planId ?? ''
  const activePlanId = isPurchasablePlan(latestPlanId) ? latestPlanId : 'free'
  return { balance, activePlanId }
}
