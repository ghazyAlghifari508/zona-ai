import { describe, expect, it } from 'vitest'
import {
  resolveArtifactDispatch,
  type ArtifactMentionInput,
} from '../../src/lib/artifacts/mentions'

const ARTIFACT_A = '10000000-0000-4000-8000-0000000000a1'
const VERSION_A = '10000000-0000-4000-8000-0000000000a2'
const ARTIFACT_B = '10000000-0000-4000-8000-0000000000b1'
const VERSION_B = '10000000-0000-4000-8000-0000000000b2'

describe('resolveArtifactDispatch', () => {
  it('routes to artifact-revise when any revise mention is present, overriding selected skill', () => {
    const mentions: ArtifactMentionInput[] = [
      { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'revise' },
    ]
    const dispatch = resolveArtifactDispatch({
      skillId: 'agent-skill',
      mentions,
    })
    expect(dispatch.type).toBe('artifact-revise')
    if (dispatch.type !== 'artifact-revise') throw new Error('wrong variant')
    expect(dispatch.targets).toEqual([
      { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'revise' },
    ])
    expect(dispatch.context).toEqual([])
  })

  it('routes to artifact-create when skill is an artifact skill and no revise mentions exist', () => {
    const mentions: ArtifactMentionInput[] = [
      { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
    ]
    const dispatch = resolveArtifactDispatch({
      skillId: 'prd-plan',
      mentions,
    })
    expect(dispatch.type).toBe('artifact-create')
    if (dispatch.type !== 'artifact-create') throw new Error('wrong variant')
    expect(dispatch.skillId).toBe('prd-plan')
    expect(dispatch.context).toEqual([
      { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
    ])
  })

  it('routes to chat when no revise mentions and skill is not an artifact skill', () => {
    const mentions: ArtifactMentionInput[] = [
      { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
    ]
    const dispatch = resolveArtifactDispatch({
      skillId: 'none',
      mentions,
    })
    expect(dispatch.type).toBe('chat')
    if (dispatch.type !== 'chat') throw new Error('wrong variant')
    expect(dispatch.context).toEqual([
      { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'context' },
    ])
  })

  it('preserves context array order and partitions revise targets from context companions', () => {
    const mentions: ArtifactMentionInput[] = [
      { artifactId: ARTIFACT_B, versionId: VERSION_B, mode: 'context' },
      { artifactId: ARTIFACT_A, versionId: VERSION_A, mode: 'revise' },
    ]
    const dispatch = resolveArtifactDispatch({
      skillId: 'checklist',
      mentions,
    })
    expect(dispatch.type).toBe('artifact-revise')
    if (dispatch.type !== 'artifact-revise') throw new Error('wrong variant')
    expect(dispatch.targets).toHaveLength(1)
    expect(dispatch.targets[0].artifactId).toBe(ARTIFACT_A)
    expect(dispatch.context).toHaveLength(1)
    expect(dispatch.context[0].artifactId).toBe(ARTIFACT_B)
  })

  it('dispatches deterministically without any active canvas input', () => {
    // Explicit mention targets B even if UI / canvas might show A
    const mentions: ArtifactMentionInput[] = [
      { artifactId: ARTIFACT_B, versionId: VERSION_B, mode: 'revise' },
    ]
    const dispatch = resolveArtifactDispatch({
      skillId: 'none',
      mentions,
    })
    expect(dispatch.type).toBe('artifact-revise')
    if (dispatch.type !== 'artifact-revise') throw new Error('wrong variant')
    expect(dispatch.targets[0].artifactId).toBe(ARTIFACT_B)
  })
})
