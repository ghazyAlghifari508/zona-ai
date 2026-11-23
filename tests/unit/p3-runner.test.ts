import { expect, it } from 'vitest'
import {
  admission,
  classifyAttempt,
  planRun,
  retryAfterMs,
} from '../../src/lib/models/p3-runner'

it('plans all independent text, repeat, preflight and vision calls for each exact route', () => {
  const jobs = planRun(['a/model', 'b/model'], 12)
  expect(jobs).toHaveLength(202)
  expect(new Set(jobs.map((job) => job.key)).size).toBe(202)
  expect(() => planRun(['a/model', 'a/model'], 12)).toThrow()
  expect(jobs[0]).toMatchObject({ route: 'a/model', kind: 'preflight' })
  expect(jobs[1]).toMatchObject({ route: 'b/model', kind: 'preflight' })
})

it('stops before an attempted retry can exceed the call or token reservation', () => {
  expect(
    admission(
      { calls: 1, reserved: 4096 },
      { maxCalls: 1, maxTokens: 9000 },
      4096,
    ),
  ).toBe(false)
  expect(
    admission(
      { calls: 1, reserved: 4096 },
      { maxCalls: 3, maxTokens: 8191 },
      4096,
    ),
  ).toBe(false)
  expect(
    admission(
      { calls: 1, reserved: 4096 },
      { maxCalls: 2, maxTokens: 8192 },
      4096,
    ),
  ).toBe(true)
})

it('does not score an unreported, substituted, or truncated route', () => {
  for (const identity of [null, 'other/model'])
    expect(classifyAttempt('a/model', identity, 'stop', '"ok"')).not.toBe(
      'valid',
    )
  expect(classifyAttempt('a/model', 'a/model', 'length', '"ok"')).toBe(
    'truncated',
  )
  expect(classifyAttempt('a/model', 'a/model', 'stop', '"ok"')).toBe('valid')
  expect(retryAfterMs('7', 0)).toBe(7000)
  expect(retryAfterMs('Thu, 01 Jan 1970 00:00:07 GMT', 0)).toBe(7000)
})
