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
