// @vitest-environment node
import { expect, it } from 'vitest'
import { validateEvaluation } from '../../src/lib/models/p3-evidence.server'
import { planRun } from '../../src/lib/models/p3-runner'

it('recomputes complete evidence and rejects missing or substituted routes', () => {
  const route = 'test/physical'
  const rows = planRun([route], 12).map((job) => ({
    key: job.key,
    state: 'valid',
    identity: route,
    route,
    raw: JSON.stringify(job.id.endsWith(':control') ? null : job.expected),
    finish: 'stop',
    fixtureHash: job.hash,
    at: '2026-11-23T00:00:00.000Z',
  }))
  expect(validateEvaluation(route, 12, rows)).toMatchObject({
    score: 100,
    bars: 4,
    credit: 15,
    vision: 'supported',
  })
  expect(() => validateEvaluation(route, 12, rows.slice(1))).toThrow()
  expect(() =>
    validateEvaluation(
      route,
      12,
      rows.map((row, i) =>
        i === 1 ? { ...row, identity: 'other/physical' } : row,
      ),
    ),
  ).toThrow()
})
