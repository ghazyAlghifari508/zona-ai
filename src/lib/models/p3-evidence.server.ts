import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { evaluationRunSchema } from './admin-model-input'
import { planRun, runnerVersion } from './p3-runner'
import {
  buildTextSuite,
  scoreAnswer,
  suiteVersion,
  summarizeText,
} from './p3-suite'
import {
  buildVisionSuite,
  summarizeVision,
  type VisionResult,
} from './p3-vision'

const header = z.object({ key: z.string(), state: z.string() })
const evidence = header.extend({
  route: z.string(),
  identity: z.string().nullable(),
  raw: z.string().nullable(),
  finish: z.string().nullable(),
  fixtureHash: z.string().nullable(),
  at: z.iso.datetime(),
})
export function validateEvaluation(
  route: string,
  seed: number,
  input: readonly unknown[],
) {
  const rows = new Map<string, unknown>()
  for (const value of input) {
    const row = header.parse(value)
    rows.set(row.key, value)
  }
  const points = new Map<string, number>()
  const outcomes = new Map<string, VisionResult>()
  const canonical = []
  for (const job of planRun([route], seed)) {
    const row = evidence.parse(rows.get(job.key))
    if (row.route !== route || row.fixtureHash !== job.hash)
      throw new Error('Evidence route or fixture mismatch')
    canonical.push(row)
    if (job.png && row.state === 'image-unsupported') {
      outcomes.set(job.id, 'unsupported')
      continue
    }
    if (
      row.identity !== route ||
      row.state !== 'valid' ||
      row.finish !== 'stop' ||
      !row.raw?.trim()
    )
      throw new Error('Incomplete exact-route evidence')
    const score = scoreAnswer(row.raw, job.expected)
    if (job.kind === 'preflight' && score !== 1)
      throw new Error('Preflight answer invalid')
    if (job.kind === 'text') points.set(job.id, score)
    if (job.kind === 'vision')
      outcomes.set(job.id, score === 1 ? 'correct' : 'wrong')
  }
  const summary = summarizeText(buildTextSuite(seed), points)
  const vision = summarizeVision(buildVisionSuite(seed), outcomes)
  if (
    summary.raw === null ||
    !summary.tier ||
    vision === 'inconclusive' ||
    vision === 'not-tested'
  )
    throw new Error('Incomplete suite coverage')
  const observedAt = canonical
    .map((r) => r.at)
    .sort()
    .at(-1)
  if (!observedAt) throw new Error('No observed timestamp')
  return {
    score: summary.raw,
    ...summary.tier,
    vision,
    categories: summary.groups,
    observedAt,
    evidenceHash: createHash('sha256')
      .update(JSON.stringify(canonical))
      .digest('hex'),
  }
}

export function loadEvaluation(run: string, route: string) {
  const directory = join('test-results', 'p3', evaluationRunSchema.parse(run))
  const { hash, ...manifest } = z
    .looseObject({
      hash: z.string().regex(/^[a-f0-9]{64}$/),
      runnerVersion: z.literal(runnerVersion),
      suiteVersion: z.literal(suiteVersion),
      seed: z.number().int().min(0).max(0xffffffff),
      routes: z.array(z.string()),
    })
    .parse(JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8')))
  const calculated = createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex')
  if (hash !== calculated || !manifest.routes.includes(route))
    throw new Error('Checkpoint manifest mismatch')
  const rows = readFileSync(join(directory, 'attempts.jsonl'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line): unknown => JSON.parse(line))
  return {
    ...validateEvaluation(route, manifest.seed, rows),
    suiteVersion,
    runnerVersion: manifest.runnerVersion,
    suiteHash: hash,
  }
}
