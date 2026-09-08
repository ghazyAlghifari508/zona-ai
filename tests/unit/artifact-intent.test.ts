import { describe, expect, it } from 'vitest'
import {
  detectArtifactIntent,
  resolveArtifactDispatch,
  type ArtifactMentionInput,
} from '../../src/lib/artifacts/mentions'

const ARTIFACT_1 = '10000000-0000-4000-8000-000000000001'
const VERSION_1 = '20000000-0000-4000-8000-000000000001'

describe('detectArtifactIntent', () => {
  it('detects revision intent when content includes addition or insertion verbs', () => {
    expect(detectArtifactIntent('tambahkan bagian accessibility')).toBe('revise')
    expect(detectArtifactIntent('tolong tambah section security')).toBe('revise')
    expect(detectArtifactIntent('add accessibility guidelines')).toBe('revise')
  })

  it('detects revision intent when content includes deletion or removal verbs', () => {
    expect(detectArtifactIntent('hapus task nomor 4')).toBe('revise')
    expect(detectArtifactIntent('hilangkan bagian database postgres')).toBe('revise')
    expect(detectArtifactIntent('delete item 3 from checklist')).toBe('revise')
  })

  it('detects revision intent when content includes edit or modification verbs', () => {
    expect(detectArtifactIntent('ubah arsitektur menjadi serverless')).toBe('revise')
    expect(detectArtifactIntent('revisi dokumen ini agar lebih ringkas')).toBe('revise')
    expect(detectArtifactIntent('update technical specifications')).toBe('revise')
    expect(detectArtifactIntent('perbaiki typo di bagian header')).toBe('revise')
  })

  it('detects discussion/analysis intent when content asks questions or opinion', () => {
    expect(detectArtifactIntent('menurutmu bagian database sudah benar?')).toBe('discuss')
    expect(detectArtifactIntent('apakah arsitektur ini sudah scalable?')).toBe('discuss')
    expect(detectArtifactIntent('bagaimana cara kerja sistem ini?')).toBe('discuss')
    expect(detectArtifactIntent('jelaskan poin nomor 2')).toBe('discuss')
    expect(detectArtifactIntent('analisis kelemahan dari PRD ini')).toBe('discuss')
    expect(detectArtifactIntent('what do you think about the database schema?')).toBe('discuss')
  })

  it('defaults to discuss for empty or ambiguous questions', () => {
    expect(detectArtifactIntent('')).toBe('discuss')
    expect(detectArtifactIntent('review PRD ini?')).toBe('discuss')
  })
})

describe('resolveArtifactDispatch with automatic intent', () => {
  const mentions: ArtifactMentionInput[] = [
    { artifactId: ARTIFACT_1, versionId: VERSION_1, mode: 'context' },
  ]

  it('automatically routes to artifact-revise when content has revision intent', () => {
    const dispatch = resolveArtifactDispatch({
      content: '@PRD Dark Mode tambahkan bagian accessibility',
      skillId: 'none',
      mentions,
    })
    expect(dispatch.type).toBe('artifact-revise')
    if (dispatch.type !== 'artifact-revise') throw new Error('invalid dispatch')
    expect(dispatch.targets[0].artifactId).toBe(ARTIFACT_1)
  })

  it('automatically routes to chat when content has discussion intent', () => {
    const dispatch = resolveArtifactDispatch({
      content: '@PRD Dark Mode menurutmu bagian database sudah benar?',
      skillId: 'none',
      mentions,
    })
    expect(dispatch.type).toBe('chat')
    if (dispatch.type !== 'chat') throw new Error('invalid dispatch')
    expect(dispatch.context[0].artifactId).toBe(ARTIFACT_1)
  })
})
