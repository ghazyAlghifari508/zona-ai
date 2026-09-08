import { z } from 'zod'
import { ARTIFACT_TITLE_MAX_LENGTH } from '../utils/constants'

export const ARTIFACT_KINDS = ['prd', 'agent-skill', 'checklist'] as const
export const ARTIFACT_OPERATION_TYPES = ['create', 'revise'] as const

export type ArtifactKind = (typeof ARTIFACT_KINDS)[number]
export type ArtifactOperationType = (typeof ARTIFACT_OPERATION_TYPES)[number]

export type StoredObjectLocator = {
  bucket: string
  key: string
}

export const artifactIdSchema = z.string().uuid()
export const artifactVersionIdSchema = z.string().uuid()

export const artifactDescriptorSchema = z.object({
  artifactId: artifactIdSchema,
  versionId: artifactVersionIdSchema,
  attachmentId: z.string().uuid(),
  generationId: z.string().uuid(),
  kind: z.enum(ARTIFACT_KINDS),
  title: z.string().trim().min(1).max(ARTIFACT_TITLE_MAX_LENGTH),
  fileName: z.string().trim().min(1).max(120),
  fileSize: z.number().int().nonnegative(),
  mimeType: z.literal('text/markdown'),
  version: z.number().int().positive(),
  modelId: z.string().min(1),
  routerModelId: z.string().min(1),
})

export type ArtifactDescriptor = z.infer<typeof artifactDescriptorSchema>

export const artifactVersionDescriptorSchema = artifactDescriptorSchema
  .omit({ artifactId: true, kind: true })
  .extend({
    sourceVersionId: artifactVersionIdSchema.nullable(),
    changeSummary: z.string().min(1),
    createdAt: z.date(),
  })

export type ArtifactVersionDescriptor = z.infer<
  typeof artifactVersionDescriptorSchema
>

export const artifactSummarySchema = artifactDescriptorSchema
  .pick({
    artifactId: true,
    kind: true,
    title: true,
    attachmentId: true,
    fileName: true,
    fileSize: true,
    mimeType: true,
    modelId: true,
    routerModelId: true,
  })
  .extend({
    currentVersionId: artifactVersionIdSchema,
    currentVersion: z.number().int().positive(),
    versionCount: z.number().int().positive(),
    updatedAt: z.date(),
  })

export type ArtifactSummary = z.infer<typeof artifactSummarySchema>

export const artifactDetailSchema = artifactSummarySchema.extend({
  createdAt: z.date(),
  versions: z.array(artifactVersionDescriptorSchema),
})

export type ArtifactDetail = z.infer<typeof artifactDetailSchema>
