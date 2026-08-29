export const CONVERSATIONS_PAGE_SIZE = 20
export const CONVERSATIONS_MAX_PAGE_SIZE = 50
export const CONVERSATION_TITLE_MAX_LENGTH = 100

export const COMPARE_MIN_MODELS = 2
export const COMPARE_MAX_MODELS = 4

export const MAX_FILE_SIZE_BYTES = Number(
  process.env.MAX_FILE_SIZE_BYTES ?? 10_485_760,
)

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export const EMBEDDING_DIMENSION = Number(
  process.env.EMBEDDING_DIMENSION ?? 1536,
)
export const EMBEDDING_MODEL =
  process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small'
export const EMBEDDING_BASE_URL =
  process.env.EMBEDDING_BASE_URL ??
  process.env.NINE_ROUTER_BASE_URL ??
  'http://localhost:20128/v1'
export const RAG_CHUNK_SIZE = Number(process.env.RAG_CHUNK_SIZE ?? 1000)
export const RAG_CHUNK_OVERLAP = Number(process.env.RAG_CHUNK_OVERLAP ?? 200)
export const RAG_TOP_K = Number(process.env.RAG_TOP_K ?? 5)
