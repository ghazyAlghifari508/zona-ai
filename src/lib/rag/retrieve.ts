if (typeof window !== 'undefined') {
  throw new Error('src/lib/rag/retrieve.ts is server-only')
}

import { sql } from 'drizzle-orm'
import { db } from '../db/index'
import { documentChunks } from '../db/schema'
import { RAG_TOP_K } from './constants'
import { embedQuery } from './embed'

function getRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[]
  return (result as { rows: T[] }).rows ?? []
}

export async function retrieveContext({
  conversationId,
  query,
  topK = RAG_TOP_K,
}: {
  conversationId: string
  query: string
  topK?: number
}): Promise<string[]> {
  const queryEmbedding = await embedQuery(query)
  // pgvector cosine distance: <=> ; use conversation_id column name directly
  const vectorLiteral = JSON.stringify(queryEmbedding)
  const result = await db.execute(
    sql`SELECT content FROM ${documentChunks} WHERE conversation_id = ${conversationId} ORDER BY embedding <=> ${vectorLiteral}::vector LIMIT ${topK}`,
  )
  const rows = getRows<{ content: string }>(result)
  return rows.map((r) => r.content as string)
}
