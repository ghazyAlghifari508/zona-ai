import { describe, expect, it } from 'vitest'
import { compareSchema } from '../../src/lib/utils/validation'

describe('compareSchema', () => {
  it('rejects <2 models', () => {
    expect(() =>
      compareSchema.parse({ modelIds: ['a'], content: 'hi' }),
    ).toThrow()
  })
  it('rejects >4', () => {
    expect(() =>
      compareSchema.parse({
        modelIds: ['a', 'b', 'c', 'd', 'e'],
        content: 'hi',
      }),
    ).toThrow()
  })
  it('rejects auto', () => {
    expect(() =>
      compareSchema.parse({
        modelIds: ['auto', 'gemini-3.7-flash-high'],
        content: 'hi',
      }),
    ).toThrow()
  })
  it('rejects dup', () => {
    expect(() =>
      compareSchema.parse({ modelIds: ['gemini', 'gemini'], content: 'hi' }),
    ).toThrow()
  })
  it('accepts 2 valid', () => {
    expect(
      compareSchema.parse({
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'hi',
      }).modelIds.length,
    ).toBe(2)
  })
  it('rejects content too long', () => {
    expect(() =>
      compareSchema.parse({
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: 'a'.repeat(20001),
      }),
    ).toThrow()
  })
  it('rejects empty content', () => {
    expect(() =>
      compareSchema.parse({
        modelIds: ['gemini-3.7-flash-high', 'gpt-5.6-sol'],
        content: '',
      }),
    ).toThrow()
  })
})
