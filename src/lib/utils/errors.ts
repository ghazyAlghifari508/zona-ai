export interface ZonaError {
  code: string
  message: string
  retryable: boolean
  action?: string
  status: number
}

type ErrorEntry = {
  message: string
  status: number
  retryable: boolean
  action?: string
}

/**
 * Error Taxonomy — 19 codes ERR-001..ERR-019 (docs/ERROR-HANDLING.md).
 * HTTP mapping: 400/401/402/403/404/413/429/500/502/504 (200 = stream-level error).
 */
const ZONA_ERROR_MAP: Record<string, ErrorEntry> = {
  'ERR-001': {
    message: 'AI service is temporarily unavailable. Please try again later.',
    status: 502,
    retryable: true,
    action: 'retry',
  },
  'ERR-002': {
    message: 'Sesi berakhir, silakan login kembali.',
    status: 401,
    retryable: false,
    action: 'login',
  },
  'ERR-003': {
    message: 'Selected model is no longer available. Please choose another.',
    status: 400,
    retryable: false,
    action: 'select-model',
  },
  'ERR-004': {
    message: 'Response timed out. The AI model took too long to respond.',
    status: 504,
    retryable: true,
    action: 'retry',
  },
  'ERR-005': {
    message: 'One model failed. Other responses are preserved.',
    status: 200,
    retryable: true,
    action: 'retry-failed',
  },
  'ERR-006': {
    message: 'Semua model gagal. Silakan coba lagi.',
    status: 200,
    retryable: true,
    action: 'retry',
  },
  'ERR-007': {
    message: 'Connection lost. Partial response preserved.',
    status: 200,
    retryable: true,
    action: 'retry',
  },
  'ERR-008': {
    message: 'Generation stopped.',
    status: 200,
    retryable: false,
  },
  'ERR-009': {
    message: 'Failed to save conversation.',
    status: 500,
    retryable: true,
    action: 'retry',
  },
  'ERR-010': {
    message: 'File upload failed. Please try again.',
    status: 500,
    retryable: true,
    action: 'retry',
  },
  'ERR-011': {
    message:
      'This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.',
    status: 400,
    retryable: false,
  },
  'ERR-012': {
    message: 'File is too large. Maximum size: 10MB.',
    status: 413,
    retryable: false,
  },
  'ERR-013': {
    message:
      'Could not process this document. It may be corrupted or password-protected.',
    status: 500,
    retryable: false,
  },
  'ERR-014': {
    message:
      'Document indexing failed. You can still chat, but document search may not work for this file.',
    status: 500,
    retryable: false,
  },
  'ERR-015': {
    message: 'Web search unavailable. Responding without web results.',
    status: 200,
    retryable: false,
  },
  'ERR-016': {
    message: 'Unexpected error from AI model.',
    status: 500,
    retryable: true,
    action: 'retry',
  },
  'ERR-017': {
    message: 'Too many requests. Please wait a moment and try again.',
    status: 429,
    retryable: true,
    action: 'retry-after',
  },
  'ERR-018': {
    message: "You're offline. Reconnecting...",
    status: 200,
    retryable: true,
  },
  'ERR-019': {
    message:
      'Kredit tidak mencukupi untuk model ini. Beralihlah ke model yang lebih hemat atau gunakan Auto.',
    status: 402,
    retryable: false,
    action: 'select-model',
  },
}

export const ZONA_ERROR_CODES = Object.keys(ZONA_ERROR_MAP)

export function getZonaError(code: string): ZonaError {
  const entry = ZONA_ERROR_MAP[code]
  if (!entry) throw new Error(`Unknown error code: ${code}`)
  return {
    code,
    message: entry.message,
    retryable: entry.retryable,
    action: entry.action,
    status: entry.status,
  }
}

/** Typed error thrown by throwZonaError — carries code/status/retryable. */
export class ZonaApiError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean
  constructor(
    message: string,
    code: string,
    status: number,
    retryable: boolean,
  ) {
    super(message)
    this.name = 'ZonaApiError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

export function throwZonaError(code: string, details?: string): never {
  const e = getZonaError(code)
  throw new ZonaApiError(
    details ? `${code}: ${e.message} (${details})` : `${code}: ${e.message}`,
    code,
    e.status,
    e.retryable,
  )
}

export class AppError extends Error {
  readonly status: number
  readonly code: string
  constructor(message: string, status = 500, code = 'ERR-000') {
    super(message)
    this.status = status
    this.code = code
    this.name = 'AppError'
  }
}

export type UsageLike = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
}

export const ERR_002: ZonaError = getZonaError('ERR-002')
