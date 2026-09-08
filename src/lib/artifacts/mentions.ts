import { z } from 'zod'
import {
  type ArtifactSkillId,
  isArtifactSkill,
  type SkillId,
} from '../chat/skills'
import { MAX_ARTIFACT_MENTIONS } from '../utils/constants'
import type { ArtifactKind } from './contracts'

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
