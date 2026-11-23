import { z } from 'zod'

export const RESERVED_MODEL_ID = 'auto'

export const adminModelIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/, 'ID model tidak valid')
  .refine((value) => value.toLowerCase() !== RESERVED_MODEL_ID, {
    message: 'Auto adalah router virtual dan tidak dapat diimpor',
  })
  .refine((value) => !value.includes('://'), {
    message: 'ID model bukan URL',
  })
const editableMetadata = {
  displayName: z.string().trim().min(1).max(120),
  vendor: z.string().trim().min(1).max(80),
  provider: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500),
  searchAliases: z.array(z.string().trim().min(1).max(80)).max(30),
}

export const createAdminModelInputSchema = z
  .object({
    modelId: adminModelIdSchema,
    ...editableMetadata,
    contextWindow: z.number().int().positive().nullable().optional(),
    reimport: z.boolean().optional(),
  })
  .strict()

export type CreateAdminModelInput = z.infer<typeof createAdminModelInputSchema>

export const updateAdminModelInputSchema = z
  .object({ modelId: adminModelIdSchema, ...editableMetadata })
  .strict()

export type UpdateAdminModelInput = z.infer<typeof updateAdminModelInputSchema>

export const retireAdminModelInputSchema = z
  .object({ modelId: adminModelIdSchema })
  .strict()

export const evaluationRunSchema = z
  .string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)

export const publishAdminModelInputSchema = z
  .object({
    modelId: adminModelIdSchema,
    run: evaluationRunSchema,
  })
  .strict()

export type PublishAdminModelInput = z.infer<
  typeof publishAdminModelInputSchema
>
