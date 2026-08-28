import { sql } from 'drizzle-orm'
import { db } from '../db/index'
import { creditTransactions } from '../db/schema'

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
