const FALLBACK_MESSAGE = 'Model gagal merespons.'

type MechanismRule = {
  id: string
  test: RegExp
  userMessage: string
}

const MECHANISM_RULES: MechanismRule[] = [
  {
    id: 'credit',
    test: /\b402\b|insufficient|kredit|credit|saldo|billing|quota\s*exceeded|balance\s*(exhausted|depleted|insufficient)|\bexhausted\b|\bdepleted\b/i,
    userMessage: 'Model gagal merespons. Kredit provider tidak mencukupi.',
  },
  {
    id: 'rate-limit',
    test: /\b429\b|rate\s*limit|too\s*many\s*requests/i,
    userMessage:
      'Terlalu banyak permintaan ke provider. Tunggu sebentar lalu coba lagi.',
  },
  {
    id: 'auth',
    test: /\b401\b|\b403\b|unauthorized|forbidden|invalid\s*api\s*key|api\s*key|authentication|permission\s*denied/i,
    userMessage:
      'Autentikasi ke provider AI gagal. Hubungi dukungan bila berlanjut.',
  },
  {
    id: 'model-unavailable',
    test: /model\s*(not\s*found|does\s*not\s*exist|is\s*not\s*available|unavailable)|no\s*endpoints\s*found|not\s*found\s*for\s*this\s*account/i,
    userMessage:
      'Model tidak tersedia saat ini. Pilih model lain untuk melanjutkan.',
  },
  {
    id: 'context-overflow',
    test: /maximum\s*context|context\s*length|context\s*window|token\s*limit|too\s*many\s*tokens|input\s*too\s*long/i,
    userMessage: 'Percakapan terlalu panjang untuk model ini.',
  },
  {
    id: 'timeout',
    test: /timed?\s*out|timeout|deadline\s*exceeded|etimedout|took\s*too\s*long/i,
    userMessage: 'Model tidak merespons dalam batas waktu. Coba lagi.',
  },
  {
    id: 'network',
    test: /econnrefused|econnreset|enotfound|ehostunreach|enetunreach|fetch\s*failed|network\s*error|socket\s*hang\s*up|getaddrinfo/i,
    userMessage:
      'Gagal terhubung ke provider AI. Periksa koneksi lalu coba lagi.',
  },
  {
    id: 'provider-outage',
    test: /\b5\d{2}\b|server\s*error|service\s*unavailable|bad\s*gateway|overloaded|internal\s*error|upstream/i,
    userMessage: 'Provider AI sedang mengalami gangguan. Coba lagi nanti.',
  },
  {
    id: 'empty-response',
    test: /tidak menghasilkan jawaban akhir|empty response|no response text|blank content/i,
    userMessage: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
  },
]

function extractRawMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }
  return ''
}

export function humanizeGenerationError(error: unknown): {
  userMessage: string
  technicalDetail: string | null
} {
  const raw = extractRawMessage(error).trim()
  if (!raw) {
    return { userMessage: FALLBACK_MESSAGE, technicalDetail: null }
  }

  for (const rule of MECHANISM_RULES) {
    if (rule.test.test(raw)) {
      return { userMessage: rule.userMessage, technicalDetail: raw }
    }
  }

  return { userMessage: FALLBACK_MESSAGE, technicalDetail: raw }
}
