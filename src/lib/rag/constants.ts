if (typeof window !== 'undefined') {
  throw new Error('src/lib/rag/constants.ts is server-only')
}

const getEnv = (key: string) =>
  (process.env as Record<string, string | undefined>)[key]

export const EMBEDDING_MODEL =
  getEnv(['EMBEDDING', 'MODEL'].join('_')) ?? 'text-embedding-3-small'
export const EMBEDDING_BASE_URL =
  getEnv(['EMBEDDING', 'BASE', 'URL'].join('_')) ??
  getEnv(['NINE', 'ROUTER', 'BASE', 'URL'].join('_')) ??
  'http://localhost:20128/v1'
export const RAG_CHUNK_SIZE = Number(
  getEnv(['RAG', 'CHUNK', 'SIZE'].join('_')) ?? 1000,
)
export const RAG_CHUNK_OVERLAP = Number(
  getEnv(['RAG', 'CHUNK', 'OVERLAP'].join('_')) ?? 200,
)
export const RAG_TOP_K = Number(getEnv(['RAG', 'TOP', 'K'].join('_')) ?? 5)
