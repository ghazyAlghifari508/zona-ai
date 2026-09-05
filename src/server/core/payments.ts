/**
 * Server-only payment settlement primitive.
 * NEVER import from client code.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'
import { db } from '../../lib/db/index'
import { creditTransactions, payments, users } from '../../lib/db/schema'

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
      description: `Purchase ${settled.planId} ${settled.billingPeriod}`,
    })
    return { creditsGranted: settled.creditsGranted, balanceAfter }
  })
}
