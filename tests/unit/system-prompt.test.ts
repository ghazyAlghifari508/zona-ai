import { describe, expect, it } from 'vitest'
import { buildSystemPrompt } from '../../src/lib/ai/system-prompt'

describe('system prompt', () => {
  it('none is natural', () => {
    const prompt = buildSystemPrompt({ skillId: 'none' })
    expect(prompt).toContain('Zona.ai')
    expect(prompt).toMatch(/directly and briefly/)
    expect(prompt).toMatch(/plain everyday language/)
  })
  it('instructs natural paragraph breaks for long answers', () => {
    const prompt = buildSystemPrompt({ skillId: 'none' })
    expect(prompt).toMatch(/one main idea per paragraph/i)
    expect(prompt).toMatch(/blank line/i)
    expect(prompt).toMatch(/single paragraph/i)
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
  it('prd-plan enforces all 7 required sections', () => {
    const prompt = buildSystemPrompt({ skillId: 'prd-plan' })
    expect(prompt).toContain('## 1. Overview')
    expect(prompt).toContain('## 2. Requirements')
    expect(prompt).toContain('## 3. Core Features')
    expect(prompt).toContain('## 4. User Flow')
    expect(prompt).toContain('## 5. Architecture')
    expect(prompt).toContain('## 6. Database Schema')
    expect(prompt).toContain('## 7. Tech Stack')
  })
  it('prd-plan requires Mermaid diagrams for architecture and ERD', () => {
    const prompt = buildSystemPrompt({ skillId: 'prd-plan' })
    expect(prompt).toMatch(/mermaid/i)
    expect(prompt).toMatch(/erDiagram/i)
  })
  it('prd-plan rejects the old shallow format', () => {
    const prompt = buildSystemPrompt({ skillId: 'prd-plan' })
    expect(prompt).toContain('Never use the old shallow format')
    expect(prompt).toContain('Definition of Done')
  })
})
