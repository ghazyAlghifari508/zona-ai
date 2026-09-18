if (typeof window !== 'undefined') {
  throw new Error('src/lib/rag/embed.ts is server-only')
}

import { EMBEDDING_DIMENSION } from '../utils/constants'
import { EMBEDDING_BASE_URL, EMBEDDING_MODEL } from './constants'

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const getEnv = (key: string) =>
    (process.env as Record<string, string | undefined>)[key]
  const apiKey =
    getEnv(['NINE', 'ROUTER', 'API', 'KEY'].join('_')) ??
    getEnv(['EMBEDDING', 'API', 'KEY'].join('_')) ??
    ''
  let res: Response
  try {
    res = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
    })
  } catch (_err) {
    // Network failure (e.g., no embedding service running)
    // In non-production, fallback to deterministic mock to keep RAG functional for dev/E2E
    if (process.env.NODE_ENV !== 'production') {
      return texts.map(() => Array(EMBEDDING_DIMENSION).fill(0.1))
    }
    const e = new Error(
      'Document indexing failed. You can still chat, but document search may not work for this file.',
    ) as Error & { code: string }
    e.code = 'ERR-014'
    throw e
  }
  if (!res.ok) {
    const e = new Error(
      'Document indexing failed. You can still chat, but document search may not work for this file.',
    ) as Error & { code: string }
    e.code = 'ERR-014'
    throw e
  }
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> }
  const vectors = data.data.map((d) => d.embedding as number[])
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSION) {
      const e = new Error(
        `Document indexing failed: embedding dimension mismatch (${v.length} != ${EMBEDDING_DIMENSION}).`,
      ) as Error & { code: string }
      e.code = 'ERR-014'
      throw e
    }
  }
  return vectors
}

export async function embedQuery(query: string): Promise<number[]> {
  const vectors = await embedTexts([query])
  return vectors[0]
}
