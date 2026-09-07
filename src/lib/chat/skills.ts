import type { ArtifactKind as ArtifactDomainKind } from '../artifacts/contracts'

export const SKILL_IDS = [
  'none',
  'checklist',
  'prd-plan',
  'agent-skill',
] as const

export type SkillId = (typeof SKILL_IDS)[number]

export type SkillOutputMode = 'chat' | 'artifact'

export type ArtifactKind = Exclude<ArtifactDomainKind, 'checklist'>

export type SkillDefinition = {
  id: SkillId
  label: string
  desc: string
  example: string
  outputMode: SkillOutputMode
  supportsCompare: boolean
  artifactKind: ArtifactKind | null
}

export const SKILL_REGISTRY: Record<SkillId, SkillDefinition> = {
  none: {
    id: 'none',
    label: 'Tanpa skill',
    desc: 'Jawaban natural',
    example: 'Tanyakan apa saja ke Zona.ai...',
    outputMode: 'chat',
    supportsCompare: true,
    artifactKind: null,
  },
  checklist: {
    id: 'checklist',
    label: 'Checklist',
    desc: 'Checklist terstruktur',
    example: 'Buatkan checklist untuk ',
    outputMode: 'chat',
    supportsCompare: true,
    artifactKind: null,
  },
  'prd-plan': {
    id: 'prd-plan',
    label: 'PRD Plan',
    desc: 'Objective → DoD',
    example: 'Buatkan PRD untuk ',
    outputMode: 'artifact',
    supportsCompare: false,
    artifactKind: 'prd',
  },
  'agent-skill': {
    id: 'agent-skill',
    label: 'Agent Skill',
    desc: 'SKILL.md modular',
    example: 'Buatkan SKILL.md untuk ',
    outputMode: 'artifact',
    supportsCompare: false,
    artifactKind: 'agent-skill',
  },
}

export const ARTIFACT_SKILL_IDS = (
  Object.values(SKILL_REGISTRY) satisfies SkillDefinition[]
)
  .filter((s) => s.outputMode === 'artifact')
  .map((s) => s.id)

export function getSkillDefinition(id: string): SkillDefinition {
  const found = (SKILL_REGISTRY as Record<string, SkillDefinition>)[id]
  return found ?? SKILL_REGISTRY.none
}

export function isArtifactSkill(id: string): boolean {
  return getSkillDefinition(id).outputMode === 'artifact'
}

export function skillSupportsCompare(id: string): boolean {
  return getSkillDefinition(id).supportsCompare
}

export function artifactKindForSkill(id: string): ArtifactKind | null {
  return getSkillDefinition(id).artifactKind
}

const ACK_SUBJECT_MAX_CHARS = 80

export function buildArtifactAck(
  kind: ArtifactKind,
  userContent: string,
): string {
  const normalized = userContent.trim().replace(/\s+/g, ' ')
  const subject =
    normalized.length > ACK_SUBJECT_MAX_CHARS
      ? `${normalized.slice(0, ACK_SUBJECT_MAX_CHARS)}…`
      : normalized
  return kind === 'agent-skill'
    ? `Bisa. Saya buatkan skill dari permintaan: "${subject}". Saya siapkan SKILL.md-nya.`
    : `Bisa. Saya susun PRD dari permintaan: "${subject}".`
}
