import { createHash } from 'node:crypto'
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { parseArgs } from 'node:util'
import { z } from 'zod'
import { evaluateGatewayJob } from '../../lib/ai/p3-gateway.server'
import { discoverGatewayModels } from '../../lib/models/model-probe'
import { p3Manifest, p3Routes } from '../../lib/models/p3-manifest'
import {
  correlateProvenance,
  type GatewayUsage,
  type Provenance,
  provenanceKey,
  readGatewayUsage,
  totalGatewayCost,
  verifyRouteProvenance,
} from '../../lib/models/p3-provenance.server'
import {
  admission,
  matchesRecheckRoute,
  planRun,
  runnerVersion,
  shouldRecheckState,
} from '../../lib/models/p3-runner'
import {
  buildTextSuite,
  defaultSeed,
  neutralSystem,
  repetitions,
  suiteVersion,
  summarizeText,
} from '../../lib/models/p3-suite'
import {
  buildVisionSuite,
  summarizeVision,
  type VisionResult,
  visionOutcome,
} from '../../lib/models/p3-vision'

const numeric = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback)
const isRetryable = (state: string) =>
  [
    'aborted',
    'gateway-error',
    'rate-limit',
    'truncated',
    'invalid-protocol',
  ].includes(state)
const rowSchema = z
  .object({
    key: z.string(),
    at: z.iso.datetime(),
    reservation: z.number().int().positive(),
    state: z.string(),
    points: z.number().min(0).max(1).nullable(),
    retryMs: z.number().nonnegative(),
    usage: z
      .object({ totalTokens: z.number().nonnegative().optional() })
      .nullable(),
    raw: z.string().nullish(),
  })
  .passthrough()
type Row = z.infer<typeof rowSchema>
const quote = (cell: unknown) =>
  `"${String(cell ?? 'unknown').replaceAll('"', '""')}"`

async function main() {
  const { values } = parseArgs({
    options: {
      route: { type: 'string', multiple: true },
      seed: { type: 'string' },
      run: { type: 'string' },
      stage: { type: 'string' },
      live: { type: 'boolean' },
      resume: { type: 'boolean' },
      discover: { type: 'boolean' },
      enrich: { type: 'boolean' },
      recheck: { type: 'boolean' },
      'recheck-route': { type: 'string', multiple: true },
      'max-calls': { type: 'string' },
      'max-tokens': { type: 'string' },
      'max-output': { type: 'string' },
      timeout: { type: 'string' },
      deadline: { type: 'string' },
      concurrency: { type: 'string' },
      retries: { type: 'string' },
      'global-gap': { type: 'string' },
      'provider-gap': { type: 'string' },
    },
  })
  const seed = numeric(defaultSeed, 0, 0xffffffff).parse(values.seed)
  const name = z
    .string()
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)
    .parse(values.run ?? 'p3-dry-run')
  const stage = z
    .enum(['preflight', 'pilot', 'full'])
    .parse(values.stage ?? 'preflight')
  const enrich = values.enrich === true
  const maxOutput = numeric(4096, 512, 32768).parse(values['max-output'])
  const timeout = numeric(60_000, 1000, 180_000).parse(values.timeout)
  const cap = {
    maxCalls: numeric(0, 0, 20000).parse(values['max-calls']),
    maxTokens: numeric(0, 0, 1_000_000_000).parse(values['max-tokens']),
  }
  const retries = numeric(1, 0, 4).parse(values.retries)
  const concurrency = numeric(1, 1, 4).parse(values.concurrency)
  const globalGap = numeric(1000, 250, 60_000).parse(values['global-gap'])
  const providerGap = numeric(2000, 500, 60_000).parse(values['provider-gap'])
  const deadline = numeric(120_000, 1000, 3_600_000).parse(values.deadline)
  const routes = values.route ?? p3Routes
  if (values.live && (!values.run || !cap.maxCalls || !cap.maxTokens))
    throw new Error(
      'Live requires --run, --max-calls and --max-tokens authorized by the operator',
    )
  if (enrich && (!values.run || !values.resume))
    throw new Error(
      'Enrichment requires --run and --resume of an existing checkpoint',
    )
  const text = buildTextSuite(seed)
  const vision = buildVisionSuite(seed)
  const jobs = planRun(routes, seed)
  const fixtureManifest = vision.map(({ png, ...fixture }) => ({
    ...fixture,
    bytes: png.length,
  }))
  const frozen = {
    runnerVersion,
    suiteVersion,
    seed,
    routes,
    maxOutput,
    timeout,
    system: neutralSystem,
    temperature: 'provider default (not sent)',
    text,
    vision: fixtureManifest,
  }
  const hash = createHash('sha256').update(JSON.stringify(frozen)).digest('hex')
  const directory = join('test-results', 'p3', name)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const lock = join(directory, '.lock')
  mkdirSync(lock)
  try {
    const journal = join(directory, 'attempts.jsonl')
    const manifestPath = join(directory, 'manifest.json')
    const manifest = JSON.stringify({ hash, ...frozen }, null, 2)
    if (values.resume) {
      if (readFileSync(manifestPath, 'utf8') !== manifest)
        throw new Error(
          'Checkpoint manifest differs from requested configuration',
        )
    } else writeFileSync(manifestPath, manifest, { flag: 'wx', mode: 0o600 })
    const history = new Map<string, Row[]>()
    const spent = { calls: 0, reserved: 0 }
    const pending = new Set<string>()
    const save = (row: Row) => {
      if (row.state === 'reserved') {
        pending.add(row.key)
        spent.calls++
        spent.reserved += row.reservation
        return
      }
      if (!pending.delete(row.key))
        throw new Error('Checkpoint result lacks reservation')
      const prior = history.get(row.key) ?? []
      prior.push(row)
      history.set(row.key, prior)
    }
    if (values.resume) {
      try {
        for (const line of readFileSync(journal, 'utf8')
          .split('\n')
          .filter(Boolean))
          save(rowSchema.parse(JSON.parse(line)))
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          )
        )
          throw error
      }
    }
    const append = (row: Row) => {
      appendFileSync(journal, `${JSON.stringify(row)}\n`, { mode: 0o600 })
      save(row)
    }
    for (const key of pending)
      append({
        key,
        at: new Date().toISOString(),
        reservation: 1,
        state: 'interrupted',
        points: null,
        retryMs: 0,
        usage: null,
      })
    const discover = values.discover || values.live
    const listing = discover
      ? await discoverGatewayModels({
          timeoutMs: Math.min(timeout, 8000),
          fetchImpl: (request, init) =>
            fetch(request, { ...init, redirect: 'error' }),
        }).catch(() => null)
      : null
    const listed = new Set(listing?.map((entry) => entry.id))
    const latest = (key: string) => history.get(key)?.at(-1)
    const reasons = new Set<string>()
    if (!values.live && !enrich)
      reasons.add('Dry run: inference not authorized')
    const stop = new AbortController()
    const cancel = () => stop.abort()
    process.on('SIGINT', cancel)
    process.on('SIGTERM', cancel)
    const timer = setTimeout(cancel, deadline)
    let nextGlobal = Date.now()
    const nextProvider = new Map<string, number>()
    let rateLimits = 0
    const reservedFor = (job: (typeof jobs)[number]) =>
      maxOutput +
      Buffer.byteLength(neutralSystem + job.prompt) +
      256 +
      (job.png ? 4096 : 0)
    try {
      if (values.live) {
        const resolveProvenance = async (input: {
          route: string
          finishedAt: Date
        }) => {
          const secret = process.env.NINE_ROUTER_API_KEY
          if (!secret) return null
          const at = input.finishedAt.toISOString()
          const usage = await readGatewayUsage({
            apiKey: secret,
            from: new Date(input.finishedAt.getTime() - 2000).toISOString(),
            to: new Date(input.finishedAt.getTime() + 1000).toISOString(),
          })
          return (
            correlateProvenance([{ route: input.route, at }], usage).get(
              provenanceKey(input.route, at),
            ) ?? null
          )
        }
        const execute = async (job: (typeof jobs)[number]) => {
          const previous = history.get(job.key) ?? []
          const last = previous.at(-1)
          const recheck =
            values.recheck === true &&
            matchesRecheckRoute(job.route, values['recheck-route'] ?? []) &&
            !!last &&
            shouldRecheckState(last.state)
          if (
            last &&
            !isRetryable(last.state) &&
            last.state !== 'interrupted' &&
            !recheck
          )
            return
          const reservation = reservedFor(job)
          const provider = job.route.split('/')[0]
          for (
            let attempt = previous.length;
            attempt <= (recheck ? previous.length + retries : retries) &&
            !stop.signal.aborted;
            attempt++
          ) {
            const time = Math.max(
              Date.now(),
              nextGlobal,
              nextProvider.get(provider) ?? 0,
              last ? Date.parse(last.at) + last.retryMs : 0,
            )
            nextGlobal = time + globalGap
            nextProvider.set(provider, time + providerGap)
            try {
              await delay(
                Math.min(Math.max(0, time - Date.now()), deadline),
                undefined,
                { signal: stop.signal },
              )
            } catch {
              break
            }
            if (stop.signal.aborted || Date.now() < time) break
            if (!admission(spent, cap, reservation)) {
              reasons.add('Authorized call/token reservation cap reached')
              stop.abort()
              break
            }
            const at = new Date().toISOString()
            append({
              key: job.key,
              at,
              reservation,
              state: 'reserved',
              points: null,
              retryMs: 0,
              usage: null,
            })
            const result = await evaluateGatewayJob(
              job,
              maxOutput,
              AbortSignal.any([stop.signal, AbortSignal.timeout(timeout)]),
              fetch,
              resolveProvenance,
            )
            const { raw, ...rest } = result
            const secret = process.env.NINE_ROUTER_API_KEY
            const redact = (value: string | null) =>
              secret && value ? value.replaceAll(secret, '[REDACTED]') : value
            append({
              key: job.key,
              at: new Date().toISOString(),
              reservation,
              ...rest,
              identity: redact(rest.identity),
              requestId: redact(rest.requestId),
              gatewayVersion: redact(rest.gatewayVersion),
              raw: redact(raw),
              route: job.route,
              caseId: job.id,
              kind: job.kind,
              expected: job.expected,
              fixtureHash: job.hash,
              payload: job.png ? 'image_url:data:image/png;base64' : 'text',
            })
            if (result.state === 'rate-limit') rateLimits++
            if (result.state === 'auth' || rateLimits >= 2) {
              reasons.add(
                result.state === 'auth'
                  ? 'Gateway auth rejected'
                  : 'Repeated gateway rate limit',
              )
              stop.abort()
              break
            }
            if (!isRetryable(result.state)) break
            const retryAt = Date.now() + Math.max(result.retryMs, providerGap)
            nextProvider.set(
              provider,
              Math.max(nextProvider.get(provider) ?? 0, retryAt),
            )
          }
        }
        const batch = async (queue: typeof jobs) => {
          let cursor = 0
          await Promise.all(
            Array.from({ length: concurrency }, async () => {
              while (!stop.signal.aborted) {
                const job = queue[cursor++]
                if (!job) return
                await execute(job)
              }
            }),
          )
        }
        await batch(jobs.filter((job) => job.kind === 'preflight'))
        if (stage !== 'preflight')
          await batch(
            jobs.filter(
              (job) =>
                job.kind !== 'preflight' &&
                latest(`${job.route}|preflight`)?.state === 'valid' &&
                (stage === 'full' ||
                  job.id === 'coding-1' ||
                  job.id === 'ocr-1'),
            ),
          )
        if (stop.signal.aborted && reasons.size === 0)
          reasons.add('Run deadline or cancellation')
      }
    } finally {
      clearTimeout(timer)
      process.off('SIGINT', cancel)
      process.off('SIGTERM', cancel)
    }
    const completed = [...history.values()]
      .flat()
      .filter((row) => row.state !== 'reserved' && row.state !== 'interrupted')
    const times = completed.map((row) => row.at).sort()
    const apiKey = process.env.NINE_ROUTER_API_KEY
    let gatewayUsage: GatewayUsage[] = []
    if (times.length > 0 && apiKey) {
      try {
        gatewayUsage = await readGatewayUsage({
          apiKey,
          from: new Date(Date.parse(times[0]) - 2000).toISOString(),
          to: new Date(
            Date.parse(times[times.length - 1]) + 1000,
          ).toISOString(),
        })
      } catch {
        gatewayUsage = []
      }
    }
    const attempts = completed.map((row) => ({
      route: typeof row.route === 'string' ? row.route : '',
      at: row.at,
    }))
    const correlated = correlateProvenance(attempts, gatewayUsage)
    type RouteEvidence = {
      verified: boolean
      reason: string
      reportedModel: string | null
      gateway: Provenance | null
    }
    const verifications = new Map<string, RouteEvidence>()
    for (const row of completed) {
      const value: unknown = row.route
      const route = typeof value === 'string' ? value : ''
      const gateway = correlated.get(provenanceKey(route, row.at))
      if (!route || !gateway) continue
      const identity: unknown = row.identity
      const reportedModel = typeof identity === 'string' ? identity : null
      verifications.set(provenanceKey(route, row.at), {
        ...verifyRouteProvenance(route, reportedModel, gateway),
        reportedModel,
        gateway,
      })
    }
    const summary = routes.map((route) => {
      const probe = latest(`${route}|preflight`)
      const reported = probe
        ? verifications.get(provenanceKey(route, probe.at))
        : undefined
      const connectivity =
        probe?.state === 'identity-mismatch' && reported?.verified
          ? 'valid'
          : (probe?.state ?? 'not-tested')
      const points = new Map<string, number>()
      const outcomes = new Map<string, VisionResult>()
      for (const job of jobs.filter((item) => item.route === route)) {
        const outcome = latest(job.key)
        if (!outcome) continue
        if (
          job.kind === 'text' &&
          outcome.state === 'valid' &&
          outcome.points !== null
        )
          points.set(job.id, outcome.points)
        if (job.kind === 'vision')
          outcomes.set(
            job.id,
            visionOutcome(outcome.state, outcome.raw, outcome.points),
          )
      }
      const scoring = summarizeText(text, points)
      const repeats = text
        .filter((c) => c.repeat)
        .map((c) => {
          const scores = Array.from({ length: repetitions }, (_, i) =>
            points.get(i ? `${c.id}:${i + 1}` : c.id),
          ).filter((p) => p !== undefined)
          return {
            id: c.id,
            n: scores.length,
            agreement:
              scores.length === repetitions ? new Set(scores).size === 1 : null,
            mean: scores.length
              ? scores.reduce((a, b) => a + b, 0) / scores.length
              : null,
            range: scores.length
              ? [Math.min(...scores), Math.max(...scores)]
              : null,
          }
        })
      const visionStatus = summarizeVision(vision, outcomes)
      const textComplete =
        scoring.raw !== null && repeats.every((r) => r.n === repetitions)
      const status =
        connectivity === 'valid' &&
        textComplete &&
        !['inconclusive', 'not-tested'].includes(visionStatus)
          ? 'review-required'
          : 'BLOCKED'
      return {
        route,
        listed: listing === null ? null : listed.has(route),
        label: listing?.find((item) => item.id === route)?.label ?? null,
        connectivity,
        scoring,
        routeEvidence: reported
          ? {
              verified: reported.verified,
              reason: reported.reason,
              reportedModel: reported.reportedModel,
              provider: reported.gateway?.provider ?? null,
              gatewayModel: reported.gateway?.model ?? null,
              cost: reported.gateway?.cost ?? null,
              deltaMs: reported.gateway?.deltaMs ?? null,
            }
          : null,
        repeats,
        vision: visionStatus,
        status,
        textComplete,
      }
    })
    const retained = p3Manifest.retained.map((route) => ({
      route,
      score:
        summary.find((row) => row.route === route && row.textComplete)?.scoring
          .raw ?? null,
    }))
    const completeValues = retained.flatMap(({ score }) =>
      score === null ? [] : [score],
    )
    const calibration = {
      retained,
      protocol:
        'Flag ceiling/floor if all retained score ≥95 or ≤5; flag limited separation if range <5. Keep 65/85 unless user approves change.',
      saturation:
        completeValues.length === retained.length
          ? completeValues.every((s) => s >= 95) ||
            completeValues.every((s) => s <= 5) ||
            Math.max(...completeValues) - Math.min(...completeValues) < 5
          : null,
    }
    const usage = [...history.values()].flat().map((r) => r.usage?.totalTokens)
    const rows = summary.map((row) => [
      row.route,
      row.connectivity,
      `${row.scoring.groups.reduce((n, g) => n + g.valid, 0)}/60`,
      ...row.scoring.groups.map((g) => g.score?.toFixed(2)),
      row.textComplete ? row.scoring.display : null,
      row.textComplete ? row.scoring.tier?.bars : null,
      row.textComplete ? row.scoring.tier?.credit : null,
      row.vision,
      row.status,
    ])
    const columns = [
      'Exact route',
      'Connectivity',
      'N valid/planned',
      'Coding',
      'Reason',
      'Math',
      'Instr',
      'Fact',
      'Context',
      'Score',
      'Bars',
      'Credit',
      'Vision',
      'Status',
    ]
    if (summary.some((row) => row.status === 'BLOCKED'))
      reasons.add('Incomplete exact-route text/repeat/Vision coverage')
    const report = {
      runnerVersion,
      suiteVersion,
      hash,
      generatedAt: new Date().toISOString(),
      mode: enrich ? 'evidence-review' : values.live ? 'live' : 'dry-run',
      stage,
      plannedCalls: jobs.length,
      plannedTokenReservation: jobs.reduce((n, job) => n + reservedFor(job), 0),
      spent,
      cap,
      usage: {
        knownTotal: usage.reduce<number>((n, v) => n + (v ?? 0), 0),
        unknownAttempts: usage.filter((v) => v === undefined).length,
        providerCost:
          gatewayUsage.length > 0 ? totalGatewayCost(gatewayUsage) : null,
        costUnknownCalls: gatewayUsage.filter((row) => row.cost === null)
          .length,
        provenanceRows: gatewayUsage.length,
      },
      calibration,
      blockers: [...reasons],
      identityCaveat:
        'A matching response model is gateway-reported, not independent upstream attestation.',
      summary,
    }
    writeFileSync(
      join(directory, 'report.json'),
      JSON.stringify(report, null, 2),
      { mode: 0o600 },
    )
    writeFileSync(
      join(directory, 'provenance.json'),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          rows: gatewayUsage,
          verifiedRoutes: summary
            .filter((row) => row.routeEvidence?.verified === true)
            .map((row) => ({
              route: row.route,
              reportedModel: row.routeEvidence?.reportedModel ?? null,
              provider: row.routeEvidence?.provider ?? null,
              gatewayModel: row.routeEvidence?.gatewayModel ?? null,
              cost: row.routeEvidence?.cost ?? null,
              deltaMs: row.routeEvidence?.deltaMs ?? null,
            })),
        },
        null,
        2,
      ),
      { mode: 0o600 },
    )
    writeFileSync(
      join(directory, 'report.csv'),
      [columns, ...rows].map((r) => r.map(quote).join(',')).join('\n'),
      { mode: 0o600 },
    )
    writeFileSync(
      join(directory, 'report.md'),
      [
        '# P3 benchmark',
        `Suite: ${hash}`,
        `Calls: ${spent.calls}/${jobs.length}. Provider cost: ${report.usage.providerCost === null ? 'unknown' : `$${report.usage.providerCost.toFixed(8)}`}.`,
        ...report.blockers,
        '',
        ...[columns, columns.map(() => '---'), ...rows].map(
          (r) => `| ${r.map((cell) => cell ?? 'unknown').join(' | ')} |`,
        ),
      ].join('\n'),
      { mode: 0o600 },
    )
    console.log(
      JSON.stringify({
        directory,
        mode: report.mode,
        planned: jobs.length,
        calls: spent.calls,
        cap,
        blockers: report.blockers,
      }),
    )
    if (values.live && report.blockers.length) process.exitCode = 2
  } finally {
    rmdirSync(lock)
  }
}

if (import.meta.main)
  await main().catch(() => {
    console.error(
      'P3 run failed: verify arguments, gateway configuration and checkpoint integrity',
    )
    process.exitCode = 1
  })
