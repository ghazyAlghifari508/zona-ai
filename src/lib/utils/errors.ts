export interface ZonaError {
  code: string
  message: string
  retryable: boolean
  action?: string
}

export const ERR_002: ZonaError = {
  code: 'ERR-002',
  message: 'Sesi berakhir, silakan login kembali.',
  retryable: false,
  action: 'login',
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
