import { buildSystemPrompt } from '../../src/lib/ai/system-prompt'
import { describe, it, expect } from 'vitest'

describe('system prompt', () => {
  it('none is natural', () => {
    expect(buildSystemPrompt({ skillId: 'none' })).toContain('Zona.ai')
  })
  it('checklist contains checkbox', () => {
    expect(buildSystemPrompt({ skillId: 'checklist' })).toContain('- [ ]')
  })
})
