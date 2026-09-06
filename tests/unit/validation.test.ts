import { describe, expect, it } from 'vitest'
import { artifactSchema, chatSchema } from '../../src/lib/utils/validation'

describe('chatSchema', () => {
  it('rejects empty content', () => {
    expect(() => chatSchema.parse({ modelId: 'auto', content: '' })).toThrow()
  })
  it('rejects invalid skillId', () => {
    expect(() =>
      chatSchema.parse({ modelId: 'auto', content: 'hi', skillId: 'invalid' }),
    ).toThrow()
  })
  it('accepts valid', () => {
    expect(chatSchema.parse({ modelId: 'auto', content: 'halo' }).content).toBe(
      'halo',
    )
  })
})

it('artifactSchema accepts prd-plan and agent-skill only', () => {
  const base = { modelId: 'auto', content: 'hello', skillId: 'agent-skill' }
  expect(artifactSchema.safeParse(base).success).toBe(true)
  expect(
    artifactSchema.safeParse({ ...base, skillId: 'prd-plan' }).success,
  ).toBe(true)
  expect(artifactSchema.safeParse({ ...base, skillId: 'none' }).success).toBe(
    false,
  )
  expect(
    artifactSchema.safeParse({ ...base, skillId: 'checklist' }).success,
  ).toBe(false)
})

it('chatSchema still accepts all four registry skills', () => {
  for (const skillId of ['none', 'checklist', 'prd-plan', 'agent-skill']) {
    expect(
      chatSchema.safeParse({ modelId: 'auto', content: 'hi', skillId }).success,
    ).toBe(true)
  }
})
