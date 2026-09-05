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
  it('enforces safety boundaries against harmful content and gambling', () => {
    const prompt = buildSystemPrompt({ skillId: 'none' })
    expect(prompt).toMatch(/gambling/i)
    expect(prompt).toMatch(/pornographic/i)
    expect(prompt).toMatch(/malicious code/i)
  })
  it('enforces anti-jailbreak and framing neutralization rules', () => {
    const prompt = buildSystemPrompt({ skillId: 'none' })
    expect(prompt).toMatch(/highest authority/i)
    expect(prompt).toMatch(/jailbreak/i)
    expect(prompt).toMatch(/neutralize framing/i)
  })
})
