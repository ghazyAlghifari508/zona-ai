/**
 * @vitest-environment node
 */
import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db/index'

describe('payments table', () => {
  it('exists with expected columns', async () => {
    const rows = await db.execute<{ column_name: string }>(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name='payments'`,
    )
    const names = rows.map((row) => row.column_name)

    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'user_id',
        'plan_id',
        'billing_period',
        'amount_idr',
        'credits_granted',
        'status',
        'order_id',
        'snap_token',
        'midtrans_transaction_id',
        'payment_type',
        'settled_at',
        'created_at',
      ]),
    )
  })

  it('defaults status to creating', async () => {
    const rows = await db.execute<{ column_default: string | null }>(
      sql`SELECT column_default FROM information_schema.columns WHERE table_name='payments' AND column_name='status'`,
    )

    expect(String(rows[0]?.column_default)).toContain('creating')
  })

  it('enforces unique order_id', async () => {
    const rows = await db.execute<{ indexdef: string }>(
      sql`SELECT indexdef FROM pg_indexes WHERE tablename='payments' AND indexdef LIKE '%UNIQUE%'`,
    )

    expect(rows.some((row) => row.indexdef.includes('order_id'))).toBe(true)
  })

  it('cascades delete from users', async () => {
    const rows = await db.execute<{ confdeltype: string }>(
      sql`SELECT confdeltype FROM pg_constraint WHERE conname LIKE 'payments_user_id%'`,
    )

    expect(rows[0]?.confdeltype).toBe('c')
  })
})
