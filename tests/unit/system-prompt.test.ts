import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt'

describe('system prompt', () => {
  it('none is natural', () => {
    expect(buildSystemPrompt({ skillId: 'none' })).toContain('Zona.ai')
  })
  it('checklist contains checkbox', () => {
    expect(buildSystemPrompt({ skillId: 'checklist' })).toContain('- [ ]')
  })
})
