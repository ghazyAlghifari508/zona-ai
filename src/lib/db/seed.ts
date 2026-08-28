import { eq } from 'drizzle-orm'
import { db } from './index'
import { users } from './schema'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/db/seed.ts is server-only — do not import on the client',
  )
}

export async function seedDev() {
  if (process.env.NODE_ENV === 'production') return
  const exists = await db
    .select()
    .from(users)
    .where(eq(users.email, 'alice@test.zona.ai'))
  if (exists.length === 0) {
    await db.insert(users).values({
      id: 'test-user-001',
      email: 'alice@test.zona.ai',
      name: 'Alice Developer',
      credits: 100,
    } as never)
  }
}
