import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'

const usageSchema = z.object({
  at: z.iso.datetime(),
  provider: z.string().min(1),
  model: z.string().min(1),
  cost: z.number().nonnegative().nullable(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  status: z.string().min(1),
})

export type GatewayUsage = z.infer<typeof usageSchema>

export const provenanceSchema = usageSchema.extend({
  deltaMs: z.number().int().nonnegative(),
})

export type Provenance = z.infer<typeof provenanceSchema>

export const provenanceKey = (route: string, at: string) => `${route}|${at}`

export function gatewayDatabasePath(): string {
  const directory =
    process.platform === 'win32'
      ? (process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'))
      : (process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'))
  return (
    process.env.NINEROUTER_DB_PATH ??
    join(directory, '9router', 'db', 'data.sqlite')
  )
}

export async function readGatewayUsage(options: {
  apiKey: string
  from: string
  to: string
  databasePath?: string
}): Promise<GatewayUsage[]> {
  const { Database } = await import('bun:sqlite')
  const database = new Database(options.databasePath ?? gatewayDatabasePath(), {
    readonly: true,
    fileMustExist: true,
  })
  try {
    const rows = database
      .query(
        `select timestamp as at, provider, model, cost, promptTokens,
                completionTokens, status
           from usageHistory
          where apiKey = ? and timestamp between ? and ?
          order by timestamp`,
      )
      .all(options.apiKey, options.from, options.to)
    return z.array(usageSchema).parse(rows)
  } finally {
    database.close()
  }
}

export function correlateProvenance(
  attempts: readonly { readonly route: string; readonly at: string }[],
  usage: readonly GatewayUsage[],
  windowMs = 2000,
): ReadonlyMap<string, Provenance> {
  const claimed = new Set<number>()
  const result = new Map<string, Provenance>()
  for (const attempt of attempts) {
    const completedAt = Date.parse(attempt.at)
    if (!Number.isFinite(completedAt)) continue
    let best: { index: number; row: GatewayUsage; delta: number } | null = null
    for (let index = 0; index < usage.length; index++) {
      if (claimed.has(index)) continue
      const row = usage[index]
      const delta = completedAt - Date.parse(row.at)
      if (!Number.isFinite(delta) || delta < 0 || delta > windowMs) continue
      if (best === null || delta < best.delta)
        best = { index, row, delta: Math.round(delta) }
    }
    if (best === null) continue
    claimed.add(best.index)
    result.set(
      provenanceKey(attempt.route, attempt.at),
      provenanceSchema.parse({ ...best.row, deltaMs: best.delta }),
    )
  }
  return result
}

export function totalGatewayCost(usage: readonly GatewayUsage[]): number {
  return usage.reduce((total, row) => total + (row.cost ?? 0), 0)
}

const canonical = (model: string) =>
  model
    .replace(/:free$/i, '')
    .replace(/-(\d{4}-\d{2}-\d{2})$/, '')
    .toLowerCase()

const sharedPrefix = (left: string, right: string) => {
  let index = 0
  while (index < left.length && left[index] === right[index]) index++
  return index
}

export function verifyRouteProvenance(
  route: string,
  reportedModel: string | null,
  provenance: Provenance,
): { verified: boolean; reason: string } {
  const expectedModel = route.split('/').slice(1).join('/')
  if (provenance.status !== 'ok')
    return { verified: false, reason: 'gateway-status-not-ok' }
  if (provenance.model !== expectedModel)
    return { verified: false, reason: 'gateway-model-mismatch' }
  if (reportedModel === null)
    return { verified: false, reason: 'identity-unreported' }
  const expected = canonical(expectedModel)
  const reported = canonical(reportedModel)
  const consistent =
    expected === reported ||
    expected.startsWith(reported) ||
    reported.startsWith(expected) ||
    sharedPrefix(expected, reported) >= 8
  if (!consistent)
    return { verified: false, reason: 'reported-model-unrelated' }
  return { verified: true, reason: 'gateway-exact-route' }
}
