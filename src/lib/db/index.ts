import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/db/index.ts is server-only — do not import on the client',
  )
}

const client = postgres(process.env.DATABASE_URL as string, { max: 10 })

export const db = drizzle(client, { schema })

export type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0]
