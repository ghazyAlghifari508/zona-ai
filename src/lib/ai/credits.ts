import { sql } from 'drizzle-orm'
import { type DatabaseTransaction, db } from '../db/index'
import { creditTransactions } from '../db/schema'
import { AppError } from '../utils/errors'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/ai/credits.ts is server-only — do not import on the client',
  )
}

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows
}

export async function deductCredits({
  userId,
  generationRunId,
  modelId,
  amount,
}: {
  userId: string
  generationRunId: string
  modelId: string
  amount: number
}): Promise<number> {
  const res = await db.execute(
    sql`UPDATE users SET credits = credits - ${amount} WHERE id=${userId} AND credits >= ${amount} RETURNING credits`,
  )
  const rows = getRows<{ credits: number }>(res)
  if (rows.length === 0) {
    const e = new Error('INSUFFICIENT_CREDITS') as Error & {
      status: number
      code: string
    }
    e.status = 402
    e.code = 'ERR-019'
    throw e
  }
  const balanceAfter = rows[0].credits
  await db.insert(creditTransactions).values({
    userId,
    generationRunId,
    amount: -amount,
    type: 'usage',
    modelId,
    balanceAfter,
    description: `Prompt via ${modelId}`,
  })
  return balanceAfter
}

export async function refundCredits(opts: {
  userId: string
  generationRunId: string
  modelId: string
  amount: number
}): Promise<number> {
  const res = await db.execute(
    sql`UPDATE users SET credits = credits + ${opts.amount} WHERE id=${opts.userId} RETURNING credits`,
  )
  const rows = getRows<{ credits: number }>(res)
  const bal = rows[0]?.credits ?? 0
  await db.insert(creditTransactions).values({
    userId: opts.userId,
    generationRunId: opts.generationRunId,
    amount: opts.amount,
    type: 'refund',
    modelId: opts.modelId,
    balanceAfter: bal,
    description: `Refund ${opts.modelId}`,
  })
  return bal
}

export async function deductCompareCredits({
  userId,
  generationRunIds,
  modelIds,
  costs,
}: {
  userId: string
  generationRunIds: string[]
  modelIds: string[]
  costs: number[]
}): Promise<number> {
  const total = costs.reduce((a, b) => a + b, 0)
  const res = await db.execute(
    sql`UPDATE users SET credits = credits - ${total} WHERE id=${userId} AND credits >= ${total} RETURNING credits`,
  )
  const rows = getRows<{ credits: number }>(res)
  if (rows.length === 0) {
    const e = new Error('Kredit tidak mencukupi') as Error & {
      status: number
      code: string
    }
    e.status = 402
    e.code = 'ERR-019'
    throw e
  }
  const balanceAfter = rows[0].credits
  for (let i = 0; i < modelIds.length; i++) {
    await db.insert(creditTransactions).values({
      userId,
      generationRunId: generationRunIds[i],
      amount: -costs[i],
      type: 'usage',
      modelId: modelIds[i],
      balanceAfter,
      description: `Compare via ${modelIds[i]}`,
    })
  }
  return balanceAfter
}

export async function reserveGenerationBatchCredits(
  tx: DatabaseTransaction,
  args: {
    userId: string
    reservations: Array<{
      generationRunId: string
      modelId: string
      amount: number
    }>
  },
): Promise<number> {
  const total = args.reservations.reduce((sum, r) => sum + r.amount, 0)
  const res = await tx.execute(
    sql`UPDATE users SET credits = credits - ${total} WHERE id=${args.userId} AND credits >= ${total} RETURNING credits`,
  )
  const rows = getRows<{ credits: number }>(res)
  if (rows.length === 0) {
    throw new AppError('Kredit tidak mencukupi', 402, 'ERR-019')
  }
  const balanceAfter = rows[0].credits
  for (const reservation of args.reservations) {
    await tx.insert(creditTransactions).values({
      userId: args.userId,
      generationRunId: reservation.generationRunId,
      amount: -reservation.amount,
      type: 'usage',
      modelId: reservation.modelId,
      balanceAfter,
      description: `Prompt via ${reservation.modelId}`,
    })
  }
  return balanceAfter
}

export async function getCreditBalance(userId: string): Promise<number> {
  const res = await db.execute(
    sql`SELECT credits FROM users WHERE id=${userId}`,
  )
  const rows = getRows<{ credits: number }>(res)
  return rows[0]?.credits ?? 0
}

export async function resetDevCredits(userId: string): Promise<number> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Forbidden in production')
  const res = await db.execute(
    sql`UPDATE users SET credits=100 WHERE id=${userId} RETURNING credits`,
  )
  const rows = getRows<{ credits: number }>(res)
  const bal = rows[0]?.credits ?? 100
  await db.insert(creditTransactions).values({
    userId,
    amount: 100,
    type: 'refill',
    balanceAfter: bal,
    description: 'Dev reset 100',
  })
  return bal
}
