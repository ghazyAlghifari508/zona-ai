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

const getEnv = (key: string) =>
  (process.env as Record<string, string | undefined>)[key]

export const EMBEDDING_DIMENSION = Number(
  getEnv(['EMBEDDING', 'DIMENSION'].join('_')) ?? 1536,
)

export const TAVILY_MAX_RESULTS = Number(
  getEnv(['TAVILY', 'MAX', 'RESULTS'].join('_')) ?? 5,
)

export const TAVILY_TIMEOUT_MS = Number(
  getEnv(['TAVILY', 'TIMEOUT', 'MS'].join('_')) ?? 10000,
)

// Rate limiting (in-memory per-user/IP) — SECURITY.md §13
export const RATE_LIMIT_CHAT_PER_MINUTE = Number(
  getEnv(['RATE_LIMIT', 'CHAT', 'PER', 'MINUTE'].join('_')) ?? 20,
)
export const RATE_LIMIT_COMPARE_PER_MINUTE = Number(
  getEnv(['RATE_LIMIT', 'COMPARE', 'PER', 'MINUTE'].join('_')) ?? 20,
)
export const RATE_LIMIT_UPLOAD_PER_MINUTE = Number(
  getEnv(['RATE_LIMIT', 'UPLOAD', 'PER', 'MINUTE'].join('_')) ?? 10,
)
export const RATE_LIMIT_SEARCH_PER_MINUTE = Number(
  getEnv(['RATE_LIMIT', 'SEARCH', 'PER', 'MINUTE'].join('_')) ?? 30,
)
export const RATE_LIMIT_WINDOW_MS = 60_000
