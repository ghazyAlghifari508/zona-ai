import { expect, it } from 'vitest'
import {
  buildVisionSuite,
  summarizeVision,
} from '../../src/lib/models/p3-vision'

it('renders deterministic real PNG fixtures and demands image-dependent answers', () => {
  const cases = buildVisionSuite(12)
  expect(cases).toEqual(buildVisionSuite(12))
  expect(cases.map((c) => c.hash)).not.toEqual(
    buildVisionSuite(13).map((c) => c.hash),
  )
  expect(new Set(cases.map((c) => c.hash)).size).toBe(8)
  expect(
    cases.every(
      (c) => c.png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    ),
  ).toBe(true)
  const results = new Map(
    cases
      .flatMap((c) => [
        [c.id, 'correct'],
        ...(c.repeat
          ? [
              [`${c.id}:repeat`, 'correct'],
              [`${c.id}:control`, 'wrong'],
            ]
          : []),
      ])
      .map(([k, v]) => [
        k,
        v === 'correct' ? ('correct' as const) : ('wrong' as const),
      ]),
  )
  expect(summarizeVision(cases, results)).toBe('supported')
  results.set('ocr-1:control', 'correct')
  expect(summarizeVision(cases, results)).toBe('unverified')
  results.delete('ocr-1')
  expect(summarizeVision(cases, results)).toBe('inconclusive')
})
