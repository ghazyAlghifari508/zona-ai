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
