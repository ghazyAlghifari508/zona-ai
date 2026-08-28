import { describe, it, expect } from 'vitest'
import { chatSchema } from '../../src/lib/utils/validation'

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
    expect(chatSchema.parse({ modelId: 'auto', content: 'halo' }).content).toBe('halo')
  })
})
