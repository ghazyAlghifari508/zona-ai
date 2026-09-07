import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_SKILL_IDS,
  artifactKindForSkill,
  getSkillDefinition,
  isArtifactSkill,
  SKILL_IDS,
  skillSupportsCompare,
} from '../../src/lib/chat/skills'

describe('skill registry', () => {
  it('exposes exactly the four supported skill ids', () => {
    expect([...SKILL_IDS].sort()).toEqual(
      ['agent-skill', 'checklist', 'none', 'prd-plan'].sort(),
    )
  })

  it('exposes exactly the three artifact skill ids', () => {
    expect([...ARTIFACT_SKILL_IDS].sort()).toEqual(
      ['agent-skill', 'checklist', 'prd-plan'].sort(),
    )
  })

  it('marks prd-plan, agent-skill, and checklist as artifact skills', () => {
    expect(isArtifactSkill('prd-plan')).toBe(true)
    expect(isArtifactSkill('agent-skill')).toBe(true)
    expect(isArtifactSkill('checklist')).toBe(true)
    expect(isArtifactSkill('none')).toBe(false)
    expect(isArtifactSkill('unknown-id')).toBe(false)
  })

  it('denies compare for artifact skills only', () => {
    expect(skillSupportsCompare('prd-plan')).toBe(false)
    expect(skillSupportsCompare('agent-skill')).toBe(false)
    expect(skillSupportsCompare('none')).toBe(true)
    expect(skillSupportsCompare('checklist')).toBe(true)
  })

  it('maps artifact skills to their kind and others to null', () => {
    expect(artifactKindForSkill('prd-plan')).toBe('prd')
    expect(artifactKindForSkill('agent-skill')).toBe('agent-skill')
    expect(artifactKindForSkill('checklist')).toBe('checklist')
    expect(artifactKindForSkill('none')).toBeNull()
  })

  it('falls back to the none definition for unknown ids', () => {
    expect(getSkillDefinition('bogus').id).toBe('none')
  })
})
