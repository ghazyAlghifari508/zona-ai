import type { ArtifactKind } from '../../lib/artifacts/contracts'
import { artifactKindForSkill } from '../../lib/chat/skills'
import { AppError } from '../../lib/utils/errors'
import type { ArtifactOperation } from '../../lib/utils/validation'
import { ARTIFACT_PROFILES, type ArtifactProfile } from './artifact-profiles'
import { getOwnedArtifactVersion } from './artifact-repository'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-operations.ts is server-only')
}

export type PlannedCreateTarget = {
  type: 'create'
  skillId: 'prd-plan' | 'agent-skill' | 'checklist'
  kind: ArtifactKind
  profile: ArtifactProfile
}

export type PlannedReviseTarget = {
  type: 'revise'
  artifactId: string
  versionId: string
  kind: ArtifactKind
  profile: ArtifactProfile
}

export type PlannedArtifactTarget = PlannedCreateTarget | PlannedReviseTarget

export async function planArtifactOperations(input: {
  userId: string
  operation: ArtifactOperation
  content?: string
}): Promise<PlannedArtifactTarget[]> {
  if (input.operation.type === 'create') {
    const kind = artifactKindForSkill(input.operation.skillId)
    if (!kind)
      throw new AppError('Skill artifact tidak didukung.', 400, 'ERR-003')
    return [
      {
        type: 'create',
        skillId: input.operation.skillId,
        kind,
        profile: ARTIFACT_PROFILES[kind],
      },
    ]
  }

  const targets = input.operation.targets
  const artifactIds = targets.map((t) => t.artifactId)
  if (new Set(artifactIds).size !== artifactIds.length) {
    throw new AppError('Duplicate artifact targets', 400, 'ERR-003')
  }

  const planned: PlannedArtifactTarget[] = []
  for (const target of targets) {
    const source = await getOwnedArtifactVersion({
      userId: input.userId,
      artifactId: target.artifactId,
      versionId: target.versionId,
    })
    planned.push({
      type: 'revise',
      artifactId: target.artifactId,
      versionId: target.versionId,
      kind: source.kind,
      profile: ARTIFACT_PROFILES[source.kind],
    })
  }
  return planned
}
