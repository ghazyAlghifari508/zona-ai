import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt'

describe('system prompt', () => {
  it('none is natural', () => {
    const prompt = buildSystemPrompt({ skillId: 'none' })
    expect(prompt).toContain('Zona.ai')
    expect(prompt).toMatch(/directly and briefly/)
    expect(prompt).toMatch(/plain everyday language/)
  })
  it('checklist contains checkbox', () => {
    expect(buildSystemPrompt({ skillId: 'checklist' })).toContain('- [ ]')
  })
  it('includes citation guidance when web sources are present', () => {
    const prompt = buildSystemPrompt({
      skillId: 'none',
      hasWebSources: true,
    })
    expect(prompt).toMatch(/\[1\]/)
  })
})
