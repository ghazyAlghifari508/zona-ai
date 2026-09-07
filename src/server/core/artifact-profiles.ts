import {
  buildAgentSkillSystemPrompt,
  SKILL_MAX_BYTES,
  SKILL_MIME_TYPE,
  validateSkillDocument,
} from '../../lib/ai/agent-skill'
import {
  detectCurrentSection,
  generatePrdFilename,
  PRD_MIME_TYPE,
  sanitizeFilename as sanitizePrdFilename,
  validatePrdContent,
} from '../../lib/ai/prd-artifact'
import { buildSystemPrompt } from '../../lib/ai/system-prompt'
import type { ArtifactKind } from '../../lib/chat/skills'
import {
  ARTIFACT_TITLE_MAX_LENGTH,
  RATE_LIMIT_AGENT_SKILL_PER_MINUTE,
  RATE_LIMIT_PRD_PER_MINUTE,
} from '../../lib/utils/constants'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-profiles.ts is server-only')
}

export type ValidatedArtifact = {
  markdown: string
  fileName: string
  fileSize: number
  summary: string
  title: string
}

function normalizeArtifactTitle(raw: string): string | null {
  const title = raw.replace(/\s+/g, ' ').trim()
  if (!title) return null
  return title.slice(0, ARTIFACT_TITLE_MAX_LENGTH)
}

function extractPrdTitle(fullText: string): string | null {
  const match = /^#[ \t]+(.+)$/m.exec(fullText)
  if (!match) return null
  return normalizeArtifactTitle(match[1])
}

export type ArtifactProfile = {
  kind: ArtifactKind
  skillId: 'prd-plan' | 'agent-skill'
  rateLimitKey: string
  rateLimitPerMinute: number
  maxBytes: number
  mimeType: 'text/markdown'
  buildSystemPrompt: (input: {
    userContent: string
    ragSuffix: string
  }) => string
  detectSection: (fullText: string) => string | undefined
  validate: (fullText: string) => { valid: boolean; issues: string[] }
  buildArtifact: (
    fullText: string,
    userContent: string,
  ) => ValidatedArtifact | null
  validationErrorMessage: string
  incompleteMessage: string
  cancelledMessage: string
  failureMessage: string
}

export const prdProfile: ArtifactProfile = {
  kind: 'prd',
  skillId: 'prd-plan',
  rateLimitKey: 'prd',
  rateLimitPerMinute: RATE_LIMIT_PRD_PER_MINUTE,
  maxBytes: 256 * 1024,
  mimeType: PRD_MIME_TYPE,
  buildSystemPrompt: ({ ragSuffix }) =>
    buildSystemPrompt({ skillId: 'prd-plan', hasWebSources: false }) +
    ragSuffix,
  detectSection: (fullText) => detectCurrentSection(fullText) ?? undefined,
  validate: (fullText) => validatePrdContent(fullText),
  buildArtifact: (fullText, userContent) => {
    const validation = validatePrdContent(fullText)
    if (!validation.valid) return null
    const title = extractPrdTitle(fullText)
    if (!title) return null
    const fileName = sanitizePrdFilename(generatePrdFilename(userContent))
    const fileSize = Buffer.byteLength(fullText, 'utf8')
    return {
      markdown: fullText,
      fileName,
      fileSize,
      summary: 'PRD selesai dibuat.',
      title,
    }
  },
  validationErrorMessage:
    'Format PRD tidak valid atau tidak lengkap dari model AI.',
  incompleteMessage:
    'PRD gagal dibuat. Hasil dari model belum bisa diproses dengan benar.',
  cancelledMessage: 'Pembuatan PRD dibatalkan.',
  failureMessage: 'Gagal menghasilkan PRD.',
}

export const agentSkillProfile: ArtifactProfile = {
  kind: 'agent-skill',
  skillId: 'agent-skill',
  rateLimitKey: 'artifact-agent-skill',
  rateLimitPerMinute: RATE_LIMIT_AGENT_SKILL_PER_MINUTE,
  maxBytes: SKILL_MAX_BYTES,
  mimeType: SKILL_MIME_TYPE,
  buildSystemPrompt: ({ ragSuffix }) =>
    `${buildAgentSkillSystemPrompt()}${ragSuffix}`,
  detectSection: () => undefined,
  validate: (fullText) => {
    const result = validateSkillDocument(fullText)
    return result.valid
      ? { valid: true, issues: [] }
      : { valid: false, issues: result.issues }
  },
  buildArtifact: (fullText) => {
    const result = validateSkillDocument(fullText)
    if (!result.valid) return null
    const title = normalizeArtifactTitle(result.document.displayName)
    if (!title) return null
    return {
      markdown: result.document.markdown,
      fileName: result.document.fileName,
      fileSize: result.document.fileSize,
      summary: result.document.summary,
      title,
    }
  },
  validationErrorMessage:
    'Skill gagal dibuat. Hasil dari model belum bisa diproses dengan benar.',
  incompleteMessage:
    'Skill gagal dibuat. Hasil dari model belum bisa diproses dengan benar.',
  cancelledMessage: 'Pembuatan skill dibatalkan.',
  failureMessage: 'Gagal menghasilkan skill.',
}

export const ARTIFACT_PROFILES: Record<ArtifactKind, ArtifactProfile> = {
  prd: prdProfile,
  'agent-skill': agentSkillProfile,
}
