/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import { MAX_ARTIFACT_VERSION_BYTES } from '../../src/lib/utils/constants'
import {
  buildArtifactObjectKey,
  buildChangeSummary,
  computeContentSha256,
  finalizeArtifactVersionInputSchema,
} from '../../src/server/core/artifact-finalization'
import { runFinalizeWithCompensation } from '../../src/server/core/artifacts'

const GEN_ID = '11111111-1111-4111-8111-111111111111'
const MSG_ID = '22222222-2222-4222-8222-222222222222'
const CONV_ID = '33333333-3333-4333-8333-333333333333'
const ART_ID = '44444444-4444-4444-8444-444444444444'
const VER_ID = '55555555-5555-4555-8555-555555555555'

const BASE_CREATE_INPUT = {
  userId: 'finalize-user',
  conversationId: CONV_ID,
  messageId: MSG_ID,
  generationId: GEN_ID,
  kind: 'prd',
  title: 'Release plan',
  modelId: 'model-internal',
  routerModelId: 'router/model',
  fileName: 'release-plan.md',
  mimeType: 'text/markdown',
  bytes: new Uint8Array([1, 2, 3]),
  summary: 'PRD selesai dibuat.',
  usage: null,
  timing: { latencyMs: 10, timeToFirstTokenMs: 2 },
} as const

describe('runFinalizeWithCompensation', () => {
  it('commits without deleting when the DB transaction succeeds', async () => {
    const writeR2 = vi.fn(async () => {})
    const commitDb = vi.fn(async () => {})
    const deleteR2 = vi.fn(async () => {})
    await runFinalizeWithCompensation({ writeR2, commitDb, deleteR2 })
    expect(writeR2).toHaveBeenCalledTimes(1)
    expect(commitDb).toHaveBeenCalledTimes(1)
    expect(deleteR2).not.toHaveBeenCalled()
  })

  it('deletes the R2 object when the DB transaction fails', async () => {
    const deleteR2 = vi.fn(async () => {})
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {},
        commitDb: async () => {
          throw new Error('db down')
        },
        deleteR2,
      }),
    ).rejects.toThrow('db down')
    expect(deleteR2).toHaveBeenCalledTimes(1)
  })

  it('surfaces cleanup failure without hiding the original error', async () => {
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {},
        commitDb: async () => {
          throw new Error('db down')
        },
        deleteR2: async () => {
          throw new Error('r2 down')
        },
      }),
    ).rejects.toThrow('db down')
  })

  it('does not touch R2 when the write itself fails', async () => {
    const deleteR2 = vi.fn(async () => {})
    await expect(
      runFinalizeWithCompensation({
        writeR2: async () => {
          throw new Error('r2 down')
        },
        commitDb: async () => {},
        deleteR2,
      }),
    ).rejects.toThrow('r2 down')
    expect(deleteR2).not.toHaveBeenCalled()
  })
})

describe('finalizeArtifactVersionInputSchema', () => {
  it('accepts a create input without source identity', () => {
    const parsed = finalizeArtifactVersionInputSchema.parse({
      ...BASE_CREATE_INPUT,
      bytes: new Uint8Array([1, 2, 3]),
      finalizationMode: 'create',
    })
    expect(parsed.finalizationMode).toBe('create')
  })

  it('accepts revise only with artifact, source, and expected current identity', () => {
    const parsed = finalizeArtifactVersionInputSchema.parse({
      ...BASE_CREATE_INPUT,
      bytes: new Uint8Array([1, 2, 3]),
      finalizationMode: 'revise',
      artifactId: ART_ID,
      sourceArtifactId: ART_ID,
      sourceVersionId: VER_ID,
      expectedCurrentVersionId: VER_ID,
    })
    if (parsed.finalizationMode !== 'revise') throw new Error('wrong mode')
    expect(parsed.artifactId).toBe(ART_ID)
    expect(parsed.expectedCurrentVersionId).toBe(VER_ID)
  })

  it('rejects revise without the updated artifact identity', () => {
    expect(() =>
      finalizeArtifactVersionInputSchema.parse({
        ...BASE_CREATE_INPUT,
        bytes: new Uint8Array([1, 2, 3]),
        finalizationMode: 'revise',
        sourceArtifactId: ART_ID,
        sourceVersionId: VER_ID,
        expectedCurrentVersionId: VER_ID,
      }),
    ).toThrow()
  })

  it('accepts fork with external source and expected current identity', () => {
    const parsed = finalizeArtifactVersionInputSchema.parse({
      ...BASE_CREATE_INPUT,
      bytes: new Uint8Array([1, 2, 3]),
      finalizationMode: 'fork',
      sourceArtifactId: ART_ID,
      sourceVersionId: VER_ID,
      expectedCurrentVersionId: VER_ID,
    })
    if (parsed.finalizationMode !== 'fork') throw new Error('wrong mode')
    expect(parsed.sourceVersionId).toBe(VER_ID)
  })

  it('rejects fork without the expected current version', () => {
    expect(() =>
      finalizeArtifactVersionInputSchema.parse({
        ...BASE_CREATE_INPUT,
        bytes: new Uint8Array([1, 2, 3]),
        finalizationMode: 'fork',
        sourceArtifactId: ART_ID,
        sourceVersionId: VER_ID,
      }),
    ).toThrow()
  })

  it('rejects empty titles, overlong titles, and non-markdown payloads', () => {
    const withBytes = (bytes: Uint8Array) => ({
      ...BASE_CREATE_INPUT,
      bytes,
      finalizationMode: 'create',
    })
    expect(() =>
      finalizeArtifactVersionInputSchema.parse({
        ...withBytes(new Uint8Array([1])),
        title: '   ',
      }),
    ).toThrow()
    expect(() =>
      finalizeArtifactVersionInputSchema.parse({
        ...withBytes(new Uint8Array([1])),
        title: 't'.repeat(201),
      }),
    ).toThrow()
    expect(
      finalizeArtifactVersionInputSchema.parse({
        ...withBytes(new Uint8Array([1])),
        title: 't'.repeat(200),
      }).title.length,
    ).toBe(200)
    expect(() => finalizeArtifactVersionInputSchema.parse(withBytes(new Uint8Array(0)))).toThrow()
    expect(() =>
      finalizeArtifactVersionInputSchema.parse(
        withBytes(new Uint8Array(MAX_ARTIFACT_VERSION_BYTES + 1)),
      ),
    ).toThrow()
    expect(() =>
      finalizeArtifactVersionInputSchema.parse({
        ...withBytes(new Uint8Array([1])),
        mimeType: 'text/plain',
      }),
    ).toThrow()
  })
})

describe('computeContentSha256', () => {
  it('hashes the exact bytes deterministically', () => {
    const bytes = new TextEncoder().encode('abc')
    expect(computeContentSha256(bytes)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(computeContentSha256(bytes)).toBe(computeContentSha256(bytes))
    expect(computeContentSha256(new TextEncoder().encode('abd'))).not.toBe(
      computeContentSha256(bytes),
    )
  })
})

describe('buildArtifactObjectKey', () => {
  it('scopes each key to a server-generated attachment id and canonical name', () => {
    const first = buildArtifactObjectKey({
      userId: 'user-1',
      attachmentId: GEN_ID,
      fileName: 'release-plan.md',
    })
    expect(first).toBe(`users/user-1/attachments/${GEN_ID}/release-plan.md`)
    const second = buildArtifactObjectKey({
      userId: 'user-1',
      attachmentId: MSG_ID,
      fileName: 'release-plan.md',
    })
    expect(second).not.toBe(first)
  })

  it('never reuses keys and strips directory traversal segments', () => {
    const key = buildArtifactObjectKey({
      userId: 'user-1',
      attachmentId: GEN_ID,
      fileName: '../evil.md',
    })
    expect(key).toBe(`users/user-1/attachments/${GEN_ID}/evil.md`)
    expect(key).not.toContain('..')
  })
})

describe('buildChangeSummary', () => {
  it('returns deterministic creation, revision, and fork summaries', () => {
    expect(buildChangeSummary('create', 1)).toBe('Created artifact')
    expect(buildChangeSummary('fork', 1)).toBe('Forked artifact')
    expect(buildChangeSummary('revise', 2)).toBe('Revised to version 2')
  })
})
