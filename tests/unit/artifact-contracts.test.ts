import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_KINDS,
  ARTIFACT_OPERATION_TYPES,
  artifactDescriptorSchema,
  artifactIdSchema,
  artifactVersionIdSchema,
} from '../../src/lib/artifacts/contracts'
import {
  ARTIFACT_TITLE_MAX_LENGTH,
  MAX_ARTIFACT_MENTIONS,
  MAX_ARTIFACT_VERSION_BYTES,
} from '../../src/lib/utils/constants'

const validDescriptor = {
  artifactId: '10000000-0000-4000-8000-000000000001',
  versionId: '10000000-0000-4000-8000-000000000002',
  attachmentId: '10000000-0000-4000-8000-000000000003',
  generationId: '10000000-0000-4000-8000-000000000004',
  kind: 'prd',
  title: 'Release plan',
  fileName: 'release-plan.md',
  fileSize: 256,
  mimeType: 'text/markdown',
  version: 1,
  modelId: 'model-internal',
  routerModelId: 'router/model',
}

describe('artifact contracts', () => {
  it('accepts only the supported artifact kinds and operation types', () => {
    expect(ARTIFACT_KINDS).toEqual(['prd', 'agent-skill', 'checklist'])
    expect(ARTIFACT_OPERATION_TYPES).toEqual(['create', 'revise'])

    for (const kind of ARTIFACT_KINDS) {
      expect(
        artifactDescriptorSchema.parse({ ...validDescriptor, kind }).kind,
      ).toBe(kind)
    }
    expect(() =>
      artifactDescriptorSchema.parse({ ...validDescriptor, kind: 'report' }),
    ).toThrow()
  })

  it('requires UUID identities and a positive integer version', () => {
    expect(artifactDescriptorSchema.parse(validDescriptor)).toEqual(
      validDescriptor,
    )
    expect(() =>
      artifactDescriptorSchema.parse({
        ...validDescriptor,
        artifactId: 'bad-id',
      }),
    ).toThrow()
    expect(() =>
      artifactDescriptorSchema.parse({
        ...validDescriptor,
        versionId: 'bad-id',
      }),
    ).toThrow()
    expect(() =>
      artifactDescriptorSchema.parse({
        ...validDescriptor,
        attachmentId: 'bad-id',
      }),
    ).toThrow()
    expect(() =>
      artifactDescriptorSchema.parse({
        ...validDescriptor,
        generationId: 'bad-id',
      }),
    ).toThrow()
    expect(() =>
      artifactDescriptorSchema.parse({ ...validDescriptor, version: 0 }),
    ).toThrow()
    expect(() =>
      artifactDescriptorSchema.parse({ ...validDescriptor, version: 1.5 }),
    ).toThrow()
  })

  it('exports reusable UUID schemas and artifact limits', () => {
    expect(artifactIdSchema.parse(validDescriptor.artifactId)).toBe(
      validDescriptor.artifactId,
    )
    expect(artifactVersionIdSchema.parse(validDescriptor.versionId)).toBe(
      validDescriptor.versionId,
    )
    expect(ARTIFACT_TITLE_MAX_LENGTH).toBe(200)
    expect(MAX_ARTIFACT_VERSION_BYTES).toBe(256 * 1024)
    expect(MAX_ARTIFACT_MENTIONS).toBe(4)
  })
})
