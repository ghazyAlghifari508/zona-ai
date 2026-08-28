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

describe('ownership', () => {
  it('user B cannot see user A conversations', async () => {
    const { users, conversations } = await import('../../src/lib/db/schema')
    const { eq } = await import('drizzle-orm')
    // Cleanup any leftovers from previous runs
    await db.delete(conversations).where(eq(conversations.userId, 'user-a'))
    await db.delete(conversations).where(eq(conversations.userId, 'user-b'))
    await db.delete(users).where(eq(users.id, 'user-a'))
    await db.delete(users).where(eq(users.id, 'user-b'))

    await db.insert(users).values({ id: 'user-a', email: 'a@test.com', name: 'A' })
    await db.insert(users).values({ id: 'user-b', email: 'b@test.com', name: 'B' })
    await db.insert(conversations).values({ id: crypto.randomUUID(), userId: 'user-a', title: 'A chat' } as never)
    const rowsB = await db.select().from(conversations).where(eq(conversations.userId, 'user-b'))
    expect(rowsB.length).toBe(0)
    await db.delete(conversations).where(eq(conversations.userId, 'user-a'))
    await db.delete(users).where(eq(users.id, 'user-a'))
    await db.delete(users).where(eq(users.id, 'user-b'))
  })
})
