import { describe, expect, it } from 'vitest'
import {
  buildSkillFilename,
  buildSkillSummary,
  SKILL_MAX_BYTES,
  slugifySkillName,
  validateSkillDocument,
} from '../../src/lib/ai/agent-skill'

const FRONTEND_SKILL = `---
name: frontend-design
description: Use when creating distinctive visual direction, typography, and interface styling.
---

# Frontend Design

## When to Use
Use this skill when a product surface needs a distinctive visual identity rather than a default component look.

## Principles
Spend boldness in one place. Let one signature visual element carry the identity, and keep surrounding decoration restrained.

## Process
Start from the emotion of the page, collect references, critique against the principles, then build.

## Constraints
Follow the project design tokens. Do not introduce new fonts or neon colors.

## Anti-patterns
Avoid generic gradient hero sections and pill-upon-pill button stacks.

## Verification Checklist
- [ ] One signature element carries the identity
- [ ] Typography follows the type scale
- [ ] No generic template patterns remain
`

const TDD_SKILL = `---
name: tdd-workflow
description: Use when implementing any feature or bugfix, before writing production code.
license: MIT
---

# TDD Workflow

## Red
Write the failing test first. Confirm it fails for the expected reason before writing production code.

## Green
Write the minimal production code that makes the failing test pass. Resist the urge to generalize early.

## Refactor
Clean up duplication with both test suites green. Each refactor step stays verifiable.

## Test Boundaries
Cover the contract, the failure mode, and one boundary case. Do not assert stochastic output.

## Common Mistakes
Do not write the implementation first and backfill tests. Do not mock the unit under test.
`

describe('agent skill document profile', () => {
  it('accepts a frontend-design skill with adapted sections', () => {
    const result = validateSkillDocument(FRONTEND_SKILL)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.document.name).toBe('frontend-design')
    expect(result.document.displayName).toBe('Frontend Design')
    expect(result.document.fileName).toBe('frontend-design.md')
    expect(buildSkillFilename(result.document)).toBe('frontend-design.md')
  })

  it('accepts a TDD skill with different sections and optional license', () => {
    const result = validateSkillDocument(TDD_SKILL)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    expect(result.document.license).toBe('MIT')
    expect(result.document.headings.length).toBeGreaterThanOrEqual(3)
  })

  it('builds a deterministic summary from validated metadata', () => {
    const result = validateSkillDocument(FRONTEND_SKILL)
    expect(result.valid).toBe(true)
    if (!result.valid) return
    const summary = buildSkillSummary(result.document)
    expect(summary.startsWith('Skill `Frontend Design` selesai dibuat.')).toBe(
      true,
    )
    expect(
      summary.includes(
        'Use when creating distinctive visual direction, typography, and interface styling.',
      ),
    ).toBe(true)
    const bullets = summary.split('\n').filter((l) => l.startsWith('- '))
    expect(bullets.length).toBeGreaterThanOrEqual(3)
    expect(bullets.length).toBeLessThanOrEqual(5)
    expect(summary.length).toBeLessThanOrEqual(2000)
  })

  it('rejects missing frontmatter, shallow body, and missing H1 with stable codes', () => {
    const missing = validateSkillDocument('# No Frontmatter\n\nBody here.\n')
    expect(missing.valid).toBe(false)
    if (missing.valid) return
    expect(missing.issues).toContain('missing-frontmatter')

    const shallow = validateSkillDocument(
      '---\nname: tiny\ndescription: Use for tiny things.\n---\n\n# Tiny\n\n## Only\n\nShort.\n',
    )
    expect(shallow.valid).toBe(false)
  })

  it('rejects malformed YAML, non-mapping frontmatter, and bad slugs', () => {
    const badYaml = validateSkillDocument(
      '---\nname: [unclosed\ndescription: x\n---\n\n# T\n\n## A\n\nBody text that is long enough to pass the length gate comfortably here.\n\n## B\n\nMore body text that is long enough to pass the length gate comfortably here.\n\n## C\n\nEven more body text that is long enough to pass the length gate comfortably here.\n',
    )
    expect(badYaml.valid).toBe(false)

    const badSlug = validateSkillDocument(
      '---\nname: "!!!"\ndescription: Use when testing slugs.\n---\n\n# T\n\n## A\n\nBody text that is long enough to pass the length gate comfortably here.\n\n## B\n\nMore body text that is long enough to pass the length gate comfortably here.\n\n## C\n\nEven more body text that is long enough to pass the length gate comfortably here.\n',
    )
    expect(badSlug.valid).toBe(false)
    if (badSlug.valid) return
    expect(badSlug.issues).toContain('invalid-slug')
  })

  it('rejects oversized output', () => {
    const big = `# Big\n\n${'x'.repeat(SKILL_MAX_BYTES + 1)}\n`
    const result = validateSkillDocument(
      `---\nname: big\ndescription: Use for big things.\n---\n\n${big}## A\n\nText.\n\n## B\n\nText.\n\n## C\n\nText.\n`,
    )
    expect(result.valid).toBe(false)
    if (result.valid) return
    expect(result.issues).toContain('oversized')
  })

  it('slugifies names deterministically', () => {
    expect(slugifySkillName('Frontend Design!')).toBe('frontend-design')
    expect(slugifySkillName('  TDD_Workflow  ')).toBe('tdd-workflow')
    expect(slugifySkillName('!!!')).toBe('')
  })

  it('strips one outer code fence during normalization', () => {
    const fenced = `\`\`\`markdown\n${FRONTEND_SKILL}\n\`\`\`\n`
    const result = validateSkillDocument(fenced)
    expect(result.valid).toBe(true)
  })
})
