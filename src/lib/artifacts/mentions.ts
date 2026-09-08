import { z } from 'zod'
import {
  type ArtifactSkillId,
  isArtifactSkill,
  type SkillId,
} from '../chat/skills'
import { MAX_ARTIFACT_MENTIONS } from '../utils/constants'
import type { ArtifactKind, ArtifactSummary } from './contracts'

export const ARTIFACT_MENTION_MODES = ['context', 'revise'] as const
export type ArtifactMentionMode = (typeof ARTIFACT_MENTION_MODES)[number]

export const artifactMentionInputSchema = z.strictObject({
  artifactId: z.string().uuid(),
  versionId: z.string().uuid(),
  mode: z.enum(ARTIFACT_MENTION_MODES),
})

export type ArtifactMentionInput = z.infer<typeof artifactMentionInputSchema>

export type ArtifactMentionDraft = ArtifactMentionInput & {
  title: string
  kind: ArtifactKind
  version: number
  fileName: string
  modelDisplayName: string
}

export type SafeArtifactMention = Omit<
  ArtifactMentionDraft,
  'fileName' | 'modelDisplayName'
> & { position: number }

export function assertUniqueMentionArtifacts(
  mentions: readonly { artifactId: string }[],
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>()
  for (const mention of mentions) {
    if (seen.has(mention.artifactId)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Artifact tidak boleh disebut dua kali dalam satu pesan',
      })
      return
    }
    seen.add(mention.artifactId)
  }
}

export const artifactMentionsSchema = z
  .array(artifactMentionInputSchema)
  .max(MAX_ARTIFACT_MENTIONS)
  .superRefine((mentions, ctx) => {
    assertUniqueMentionArtifacts(mentions, ctx)
  })

export type ArtifactDispatch =
  | { type: 'chat'; context: ArtifactMentionInput[] }
  | {
      type: 'artifact-create'
      skillId: ArtifactSkillId
      context: ArtifactMentionInput[]
    }
  | {
      type: 'artifact-revise'
      targets: ArtifactMentionInput[]
      context: ArtifactMentionInput[]
    }

export function resolveArtifactDispatch({
  skillId,
  mentions,
}: {
  skillId: SkillId
  mentions: readonly ArtifactMentionInput[]
}): ArtifactDispatch {
  const targets = mentions.filter((m) => m.mode === 'revise')
  const context = mentions.filter((m) => m.mode === 'context')

  if (targets.length > 0) {
    return {
      type: 'artifact-revise',
      targets: targets.map((t) => ({ ...t })),
      context: context.map((c) => ({ ...c })),
    }
  }

  if (isArtifactSkill(skillId)) {
    return {
      type: 'artifact-create',
      skillId: skillId as ArtifactSkillId,
      context: context.map((c) => ({ ...c })),
    }
  }

  return {
    type: 'chat',
    context: context.map((c) => ({ ...c })),
  }
}

export type MentionQuery = { start: number; end: number; query: string }

export type ArtifactMentionDraftState = {
  mentions: ArtifactMentionDraft[]
  activeQuery: MentionQuery | null
  selectedIndex: number
  feedback: string | null
}

export type ArtifactMentionCandidate = {
  artifact: ArtifactSummary
  kindLabel: string
  modelDisplayName: string
}

export function findActiveMentionQuery(
  text: string,
  caret: number,
): MentionQuery | null {
  if (caret < 0 || caret > text.length) return null
  const atIndex = text.lastIndexOf('@', caret - 1)
  if (atIndex === -1) return null

  // Ensure @ is at start of string or preceded by whitespace / opening punctuation
  if (atIndex > 0) {
    const prevChar = text[atIndex - 1]
    if (!/[\s([{]/.test(prevChar)) return null
  }

  const queryCandidate = text.slice(atIndex + 1, caret)
  // If query contains any whitespace, mention query is inactive/terminated
  if (/[\s\r\n]/.test(queryCandidate)) return null

  return {
    start: atIndex,
    end: caret,
    query: queryCandidate,
  }
}

export function replaceActiveMentionQuery(
  text: string,
  query: MentionQuery,
): { text: string; caret: number } {
  const before = text.slice(0, query.start)
  const after = text.slice(query.end)
  return {
    text: before + after,
    caret: query.start,
  }
}

export function filterArtifactMentions(
  candidates: readonly ArtifactMentionCandidate[],
  query: string,
): ArtifactMentionCandidate[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...candidates]

  type Scored = {
    candidate: ArtifactMentionCandidate
    score: number
    index: number
  }
  const scored: Scored[] = []

  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i]
    const title = candidate.artifact.title.toLowerCase()
    const fileName = candidate.artifact.fileName.toLowerCase()
    const kind = candidate.kindLabel.toLowerCase()
    const model = candidate.modelDisplayName.toLowerCase()

    let score = 0
    if (title === q || fileName === q) {
      score = 3
    } else if (title.startsWith(q) || fileName.startsWith(q)) {
      score = 2
    } else if (
      title.includes(q) ||
      fileName.includes(q) ||
      kind.includes(q) ||
      model.includes(q)
    ) {
      score = 1
    }

    if (score > 0) {
      scored.push({ candidate, score, index: i })
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.index - b.index
  })

  return scored.map((s) => s.candidate)
}

export function addArtifactMention(
  state: ArtifactMentionDraftState,
  candidate: ArtifactMentionCandidate,
  mode: ArtifactMentionMode,
): ArtifactMentionDraftState {
  if (
    state.mentions.some((m) => m.artifactId === candidate.artifact.artifactId)
  ) {
    return {
      ...state,
      feedback: 'Artifact sudah ditambahkan ke mention',
    }
  }

  if (state.mentions.length >= MAX_ARTIFACT_MENTIONS) {
    return {
      ...state,
      feedback: `Maksimal ${MAX_ARTIFACT_MENTIONS} mention per pesan`,
    }
  }

  const newDraft: ArtifactMentionDraft = {
    artifactId: candidate.artifact.artifactId,
    versionId: candidate.artifact.currentVersionId,
    mode,
    title: candidate.artifact.title,
    kind: candidate.artifact.kind,
    version: candidate.artifact.currentVersion,
    fileName: candidate.artifact.fileName,
    modelDisplayName: candidate.modelDisplayName,
  }

  return {
    ...state,
    mentions: [...state.mentions, newDraft],
    feedback: null,
    activeQuery: null,
    selectedIndex: 0,
  }
}

export function removeArtifactMention(
  state: ArtifactMentionDraftState,
  artifactId: string,
): ArtifactMentionDraftState {
  return {
    ...state,
    mentions: state.mentions.filter((m) => m.artifactId !== artifactId),
    feedback: null,
  }
}

export function setArtifactMentionMode(
  state: ArtifactMentionDraftState,
  artifactId: string,
  mode: ArtifactMentionMode,
): ArtifactMentionDraftState {
  return {
    ...state,
    mentions: state.mentions.map((m) =>
      m.artifactId === artifactId ? { ...m, mode } : m,
    ),
    feedback: null,
  }
}

export function addOrFocusArtifactMention(
  state: ArtifactMentionDraftState,
  candidate: ArtifactMentionCandidate,
  mode: ArtifactMentionMode,
): ArtifactMentionDraftState {
  const existing = state.mentions.find(
    (m) => m.artifactId === candidate.artifact.artifactId,
  )
  if (existing) {
    return {
      ...state,
      feedback: null,
      mentions: state.mentions.map((m) =>
        m.artifactId === candidate.artifact.artifactId
          ? {
              ...m,
              mode,
              versionId: candidate.artifact.currentVersionId,
              version: candidate.artifact.currentVersion,
            }
          : m,
      ),
    }
  }
  return addArtifactMention(state, candidate, mode)
}

export function moveMentionPickerSelection(
  state: ArtifactMentionDraftState,
  direction: -1 | 1,
  resultCount: number,
): ArtifactMentionDraftState {
  if (resultCount <= 0) {
    return { ...state, selectedIndex: 0 }
  }
  const next = (state.selectedIndex + direction + resultCount) % resultCount
  return { ...state, selectedIndex: next }
}
