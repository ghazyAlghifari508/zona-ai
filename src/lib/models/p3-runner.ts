import { validateExactRoutes } from './p3-manifest'
import { buildTextSuite, repetitions } from './p3-suite'
import { buildVisionSuite } from './p3-vision'

export const runnerVersion = 'zona-p3-runner-v2'

export function planRun(routes: readonly string[], seed: number) {
  const exact = validateExactRoutes(routes)
  const text = buildTextSuite(seed)
  const vision = buildVisionSuite(seed)
  const probes = exact.map((route) => ({
    route,
    id: 'preflight',
    kind: 'preflight' as const,
    prompt: 'Return the JSON string "ok".',
    expected: 'ok',
    png: null,
    hash: null,
  }))
  const cases = exact.flatMap((route) => [
    ...text.flatMap((c) =>
      Array.from({ length: c.repeat ? repetitions : 1 }, (_, i) => ({
        route,
        kind: 'text' as const,
        id: i === 0 ? c.id : `${c.id}:${i + 1}`,
        prompt: c.prompt,
        expected: c.expected,
        png: null,
        hash: null,
      })),
    ),
    ...vision.flatMap((c) => [
      {
        route,
        kind: 'vision' as const,
        id: c.id,
        prompt: c.prompt,
        expected: c.expected,
        png: c.png,
        hash: c.hash,
      },
      ...(c.repeat
        ? [
            {
              route,
              kind: 'vision' as const,
              id: `${c.id}:repeat`,
              prompt: c.prompt,
              expected: c.expected,
              png: c.png,
              hash: c.hash,
            },
            {
              route,
              kind: 'vision' as const,
              id: `${c.id}:control`,
              prompt: c.prompt,
              expected: c.expected,
              png: null,
              hash: null,
            },
          ]
        : []),
    ]),
  ])
  return [...probes, ...cases].map((job) => ({
    ...job,
    key: `${job.route}|${job.id}`,
  }))
}
export type Job = ReturnType<typeof planRun>[number]

export function admission(
  spent: { calls: number; reserved: number },
  cap: { maxCalls: number; maxTokens: number },
  reservation: number,
) {
  return (
    spent.calls < cap.maxCalls && spent.reserved + reservation <= cap.maxTokens
  )
}

export function classifyAttempt(
  route: string,
  identity: string | null,
  finish: string | undefined,
  text: string,
) {
  if (!identity) return 'identity-unreported'
  if (route !== identity) return 'identity-mismatch'
  if (finish === 'length') return 'truncated'
  if (finish !== 'stop' || !text.trim()) return 'invalid-protocol'
  return 'valid'
}

export function retryAfterMs(value: string | null, now: number): number {
  if (value === null) return 0
  const seconds = /^\d+$/.test(value) ? Number(value) : Number.NaN
  const delay = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(value) - now
  return Number.isFinite(delay) ? Math.max(0, delay) : 0
}
