import { expect, it } from 'vitest'
import {
  buildTextSuite,
  categories,
  classifyScore,
  scoreAnswer,
  summarizeText,
} from '../../src/lib/models/p3-suite'

it('allocates 60 independent cases and two repeat cases per category', () => {
  const cases = buildTextSuite(19)
  expect(new Set(cases.map((c) => c.prompt)).size).toBe(60)
  expect(cases).toEqual(buildTextSuite(19))
  expect(cases).not.toEqual(buildTextSuite(20))
  for (const [category, count] of Object.entries(categories)) {
    const group = cases.filter((c) => c.category === category)
    expect(group).toHaveLength(count)
    expect(group.filter((c) => c.repeat)).toHaveLength(2)
    expect(new Set(group.map((c) => c.difficulty)).size).toBe(3)
  }
})

it('distinguishes partial content, invalid answers and incomplete transport coverage', () => {
  expect(scoreAnswer('[7,8]', [7, 9])).toBe(0.5)
  expect(scoreAnswer('```json\n42\n```', 42)).toBe(1)
  expect(scoreAnswer('42 and no other value', 42)).toBe(0)
  const cases = buildTextSuite(19)
  const results = new Map(cases.map((c) => [c.id, 1]))
  expect(summarizeText(cases, results).raw).toBe(100)
  results.delete(cases[0].id)
  expect(summarizeText(cases, results).tier).toBeNull()
})

it.each([
  [64.999, 2, 3],
  [65, 3, 6],
  [84.999, 3, 6],
  [85, 4, 15],
])('classifies raw score %s before display rounding', (score, bars, credit) => {
  expect(classifyScore(score)).toMatchObject({ bars, credit })
})
