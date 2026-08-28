/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { db } from '../../src/lib/db/index'
import { sql } from 'drizzle-orm'

describe('generation_runs schema', () => {
  it('has generation_runs table', async () => {
    const r = await db.execute(sql`SELECT to_regclass('public.generation_runs') as cls`)
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows
    const val = (rows[0] as { cls: string | null }).cls
    expect(val).toBe('generation_runs')
  })
  it('has credit_transactions table', async () => {
    const r = await db.execute(sql`SELECT to_regclass('public.credit_transactions') as cls`)
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows
    const val = (rows[0] as { cls: string | null }).cls
    expect(val).toBe('credit_transactions')
  })
  it('has usage_records table', async () => {
    const r = await db.execute(sql`SELECT to_regclass('public.usage_records') as cls`)
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows
    const val = (rows[0] as { cls: string | null }).cls
    expect(val).toBe('usage_records')
  })
})
