/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { db } from '../../src/lib/db/index'
import { sql } from 'drizzle-orm'

describe('db schema', () => {
  it('has conversations table with userId FK', async () => {
    const r = await db.execute(
      sql`SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name='user_id'`,
    )
    // drizzle postgres-js returns array directly, not .rows
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows
    expect(rows.length).toBe(1)
  })

  it('vector extension exists', async () => {
    const r = await db.execute(sql`SELECT * FROM pg_extension WHERE extname='vector'`)
    const rows = Array.isArray(r) ? r : (r as unknown as { rows: unknown[] }).rows
    expect(rows.length).toBe(1)
  })

  it('users credits default 100', async () => {
    const r = await db.execute(
      sql`SELECT column_default FROM information_schema.columns WHERE table_name='users' AND column_name='credits'`,
    )
    const rows = Array.isArray(r) ? (r as unknown as Array<{ column_default: string }>) : (r as unknown as { rows: Array<{ column_default: string }> }).rows
    const val = (rows[0] as { column_default: string }).column_default
    expect(String(val)).toContain('100')
  })
})
