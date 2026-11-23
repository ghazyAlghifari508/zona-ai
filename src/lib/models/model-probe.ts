import { z } from 'zod'

const PROBE_TIMEOUT_MS = readPositiveEnv('ZONA_ADMIN_PROBE_TIMEOUT_MS', 8_000)
const PROBE_MAX_RETRIES = readPositiveEnv('ZONA_ADMIN_PROBE_MAX_RETRIES', 1)
const PROBE_RETRY_CAP_MS = readPositiveEnv(
  'ZONA_ADMIN_PROBE_RETRY_CAP_MS',
  2_000,
)

export const MODEL_PROBE_CONFIG = {
  timeoutMs: PROBE_TIMEOUT_MS,
  maxRetries: PROBE_MAX_RETRIES,
  retryCapMs: PROBE_RETRY_CAP_MS,
} as const

function readPositiveEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const gatewayModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().nullable().optional(),
  context_window: z.number().int().positive().nullable().optional(),
  max_output: z.number().int().positive().nullable().optional(),
  owned_by: z.string().nullable().optional(),
})

const gatewayModelListSchema = z.object({ data: z.array(gatewayModelSchema) })

const completionMessageSchema = z.object({
  content: z.string().nullable().optional(),
  reasoning_content: z.string().nullable().optional(),
})

const completionSchema = z.object({
  model: z.string().nullable().optional(),
  choices: z.array(z.object({ message: completionMessageSchema })).min(1),
})

export const gatewayModelSchemaOut = z.object({
  id: z.string().min(1),
  label: z.string().nullable(),
  contextWindow: z.number().int().positive().nullable(),
  maxOutput: z.number().int().positive().nullable(),
  provider: z.string().nullable(),
})

export type GatewayModelDiscovery = z.infer<typeof gatewayModelSchemaOut>

export const probeOutcomeSchema = z.enum([
  'valid',
  'unknown',
  'auth_failure',
  'rate_limit',
  'timeout',
  'upstream_error',
  'invalid_response',
])

export type ProbeOutcome = z.infer<typeof probeOutcomeSchema>

export const connectionProbeSchema = z
  .object({
    modelId: z.string().min(1),
    outcome: probeOutcomeSchema,
    listed: z.boolean(),
    httpStatus: z.number().int().nullable(),
    durationMs: z.number().int().nonnegative(),
    identityModel: z.string().nullable(),
    provider: z.string().nullable(),
    provenanceVerified: z.boolean(),
    message: z.string().min(1),
    checkedAt: z.string(),
  })
  .strict()

export type ConnectionProbe = z.infer<typeof connectionProbeSchema>

export interface GatewayProbeConfig {
  baseUrl: string
  apiKey: string
  fetchImpl: typeof fetch
  timeoutMs: number
  maxRetries: number
  retryCapMs: number
}

type ProbeConfigOverrides = Partial<Omit<GatewayProbeConfig, 'fetchImpl'>> & {
  fetchImpl?: typeof fetch
  listing?: readonly GatewayModelDiscovery[]
}

export function getGatewayProbeConfig(): GatewayProbeConfig {
  const baseUrl = process.env.NINE_ROUTER_BASE_URL
  const apiKey = process.env.NINE_ROUTER_API_KEY
  if (!baseUrl || !apiKey) {
    throw new Error('9Router gateway belum dikonfigurasi')
  }
  return {
    baseUrl,
    apiKey,
    fetchImpl: fetch,
    timeoutMs: MODEL_PROBE_CONFIG.timeoutMs,
    maxRetries: MODEL_PROBE_CONFIG.maxRetries,
    retryCapMs: MODEL_PROBE_CONFIG.retryCapMs,
  }
}

export function resolveGatewayEndpoint(
  base: string,
  path: '/models' | '/chat/completions',
): string {
  const url = new URL(base)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Base URL 9Router harus HTTP atau HTTPS')
  }
  if (url.username || url.password) {
    throw new Error('Base URL 9Router tidak boleh memuat credential')
  }
  const basePath = url.pathname.replace(/\/+$/, '')
  const versionPath = basePath.endsWith('/v1') ? basePath : `${basePath}/v1`
  url.pathname = `${versionPath}${path}`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function withTimeout(config: GatewayProbeConfig): {
  signal: AbortSignal
  cleanup: () => void
} {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), config.timeoutMs)
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  }
}

function authHeaders(config: GatewayProbeConfig): HeadersInit {
  return {
    authorization: `Bearer ${config.apiKey}`,
    'content-type': 'application/json',
  }
}

async function parseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function discoverGatewayModels(
  overrides: ProbeConfigOverrides = {},
): Promise<GatewayModelDiscovery[]> {
  const config = { ...getGatewayProbeConfig(), ...overrides }
  const { signal, cleanup } = withTimeout(config)
  try {
    const response = await config.fetchImpl(
      resolveGatewayEndpoint(config.baseUrl, '/models'),
      { headers: authHeaders(config), signal },
    )
    if (!response.ok) return []
    const parsed = gatewayModelListSchema.safeParse(await parseJson(response))
    if (!parsed.success) return []
    return parsed.data.data.map((model) => ({
      id: model.id,
      label: model.name?.trim() ? model.name.trim() : null,
      contextWindow: model.context_window ?? null,
      maxOutput: model.max_output ?? null,
      provider: model.owned_by?.trim() ? model.owned_by.trim() : null,
    }))
  } finally {
    cleanup()
  }
}

function classifyHttpStatus(status: number): ProbeOutcome {
  if (status === 401 || status === 403) return 'auth_failure'
  if (status === 429) return 'rate_limit'
  if (status === 404) return 'unknown'
  if (status >= 500) return 'upstream_error'
  return 'invalid_response'
}

function retryDelayMs(response: Response, config: GatewayProbeConfig): number {
  const raw = response.headers.get('retry-after')
  const seconds = raw === null ? Number.NaN : Number(raw)
  const delay = Number.isFinite(seconds) ? seconds * 1_000 : 500
  return Math.min(Math.max(delay, 0), config.retryCapMs)
}

function probeMessage(
  outcome: ProbeOutcome,
  verified: boolean,
  listed: boolean,
): string {
  switch (outcome) {
    case 'valid':
      return verified
        ? 'Koneksi berhasil dan identitas model sesuai route.'
        : listed
          ? 'Koneksi berhasil, tetapi gateway tidak mengonfirmasi identitas model.'
          : 'Koneksi berhasil pada route exact; model tidak muncul di daftar gateway.'
    case 'unknown':
      return 'Gateway menolak route ini sebagai model yang tidak dikenal.'
    case 'auth_failure':
      return 'Autentikasi gateway ditolak. Periksa kredensial server.'
    case 'rate_limit':
      return 'Gateway membatasi permintaan. Coba lagi setelah batas pulih.'
    case 'timeout':
      return 'Gateway tidak merespons dalam batas waktu yang ditetapkan.'
    case 'upstream_error':
      return 'Gateway mengalami gangguan saat memproses permintaan.'
    case 'invalid_response':
      return 'Respons gateway tidak memuat teks asisten yang valid.'
  }
}

export async function probeModelConnection(
  modelId: string,
  overrides: ProbeConfigOverrides = {},
): Promise<ConnectionProbe> {
  const config = { ...getGatewayProbeConfig(), ...overrides }
  const started = Date.now()
  const listing =
    overrides.listing ?? (await discoverGatewayModels(config).catch(() => []))
  const listed = listing.some((model) => model.id === modelId)
  const discovered = listing.find((model) => model.id === modelId)

  let outcome: ProbeOutcome = 'invalid_response'
  let httpStatus: number | null = null
  let identityModel: string | null = null

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    const { signal, cleanup } = withTimeout(config)
    try {
      const response = await config.fetchImpl(
        resolveGatewayEndpoint(config.baseUrl, '/chat/completions'),
        {
          method: 'POST',
          headers: authHeaders(config),
          body: JSON.stringify({
            model: modelId,
            messages: [{ role: 'user', content: 'Balas dengan satu kata: ok' }],
            max_tokens: 16,
            stream: false,
          }),
          signal,
        },
      )
      httpStatus = response.status

      if (!response.ok) {
        outcome = classifyHttpStatus(response.status)
        const retryable =
          (outcome === 'upstream_error' || outcome === 'rate_limit') &&
          attempt < config.maxRetries
        if (retryable) {
          const delayMs = retryDelayMs(response, config)
          const { promise: delay, resolve: finishDelay } =
            Promise.withResolvers<void>()
          cleanup()
          setTimeout(finishDelay, delayMs)
          await delay
          continue
        }
        break
      }

      const parsed = completionSchema.safeParse(await parseJson(response))
      if (!parsed.success) {
        outcome = 'invalid_response'
        break
      }
      const text = parsed.data.choices[0]?.message.content?.trim()
      if (!text) {
        outcome = 'invalid_response'
        break
      }
      identityModel = parsed.data.model?.trim()
        ? parsed.data.model.trim()
        : null
      outcome = 'valid'
      break
    } catch (error) {
      outcome =
        error instanceof Error && error.name === 'AbortError'
          ? 'timeout'
          : 'upstream_error'
      break
    } finally {
      cleanup()
    }
  }

  const provenanceVerified = outcome === 'valid' && identityModel === modelId
  return connectionProbeSchema.parse({
    modelId,
    outcome,
    listed,
    httpStatus,
    durationMs: Date.now() - started,
    identityModel,
    provider: discovered?.provider ?? null,
    provenanceVerified,
    message: probeMessage(outcome, provenanceVerified, listed),
    checkedAt: new Date().toISOString(),
  })
}
