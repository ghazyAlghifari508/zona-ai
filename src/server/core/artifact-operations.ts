import type { ArtifactKind } from '../../lib/artifacts/contracts'
import { artifactKindForSkill } from '../../lib/chat/skills'
import {
  COMPARE_MAX_MODELS,
  COMPARE_MIN_MODELS,
} from '../../lib/utils/constants'
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

export type ComparePlannedGeneration = {
  targetIndex: number
  modelId: string
  target: PlannedArtifactTarget
}

export type PlannedCompareOperations = {
  targets: PlannedArtifactTarget[]
  generations: ComparePlannedGeneration[]
  comparisonRunCount: number
}

function validateCompareModelIds(modelIds: string[]): void {
  if (
    modelIds.length < COMPARE_MIN_MODELS ||
    modelIds.length > COMPARE_MAX_MODELS
  ) {
    throw new AppError('Model Compare tidak valid.', 400, 'ERR-003')
  }
  if (modelIds.includes('auto')) {
    throw new AppError('Auto tidak tersedia di Compare', 400, 'ERR-003')
  }
  if (new Set(modelIds).size !== modelIds.length) {
    throw new AppError('Model tidak boleh duplikat', 400, 'ERR-003')
  }
}

export async function planCompareArtifactOperations(input: {
  userId: string
  operation: ArtifactOperation
  modelIds: string[]
  content?: string
}): Promise<PlannedCompareOperations> {
  validateCompareModelIds(input.modelIds)
  const targets = await planArtifactOperations({
    userId: input.userId,
    operation: input.operation,
    content: input.content,
  })
  const generations: ComparePlannedGeneration[] = []
  for (let targetIndex = 0; targetIndex < targets.length; targetIndex++) {
    for (const modelId of input.modelIds) {
      generations.push({
        targetIndex,
        modelId,
        target: targets[targetIndex],
      })
    }
  }
  return {
    targets,
    generations,
    comparisonRunCount: targets.length,
  }
}
