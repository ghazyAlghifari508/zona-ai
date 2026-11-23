import { z } from 'zod'

export const catalogCapabilitiesSchema = z
  .object({
    text: z.boolean(),
    vision: z.boolean(),
    files: z.boolean(),
    tools: z.boolean(),
    reasoning: z.boolean(),
    structuredOutput: z.boolean(),
  })
  .strict()

export const catalogStatusSchema = z.enum(['active', 'inactive', 'retired'])
export const evaluationStatusSchema = z.enum([
  'legacy',
  'pending',
  'verified',
  'failed',
  'inconclusive',
])
export const visionStatusSchema = z.enum([
  'supported',
  'unsupported',
  'unverified',
  'inconclusive',
  'not-tested',
])
export const creditTierSchema = z.enum([
  'economy',
  'balanced',
  'premium',
  'adaptive',
])
export const confidenceSchema = z.enum(['high', 'medium', 'low'])
export const routingProfileSchema = z.enum([
  'lightweight',
  'coding',
  'reasoning',
  'general',
  'router',
])
export const intelligenceLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])
const creditCostSchema = z.union([
  z.number().int().nonnegative(),
  z
    .object({
      min: z.number().int().nonnegative(),
      max: z.number().int().nonnegative(),
    })
    .strict(),
  z.null(),
])
export const catalogMetadataSchema = z
  .object({
    contextWindow: z.number().int().nullable(),
    maxOutput: z.number().int().nullable(),
    pricing: z
      .object({
        inputPerMillion: z.number().nullable(),
        outputPerMillion: z.number().nullable(),
      })
      .strict()
      .nullable(),
    category: z.string(),
    speedClass: z.string(),
  })
  .strict()

export const catalogEntryDtoSchema = z
  .object({
    id: z.string().min(1),
    routerModelId: z.string().min(1),
    displayName: z.string().min(1),
    provider: z.string().min(1),
    vendor: z.string().min(1),
    description: z.string(),
    intelligenceLevel: intelligenceLevelSchema,
    intelligenceScore: z.number().int(),
    intelligenceBars: intelligenceLevelSchema,
    confidence: confidenceSchema,
    creditCost: creditCostSchema,
    creditTier: creditTierSchema,
    capabilities: catalogCapabilitiesSchema,
    searchAliases: z.array(z.string()),
    aliasIds: z.array(z.string()),
    evaluationStatus: evaluationStatusSchema,
    visionStatus: visionStatusSchema,
    isDefault: z.boolean(),
    isActive: z.boolean(),
    status: catalogStatusSchema,
    disabledReason: z.string().nullable(),
    metadata: catalogMetadataSchema,
  })
  .strict()

export const catalogHistoryLabelSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    routerModelId: z.string().min(1),
    status: catalogStatusSchema,
  })
  .strict()

export const catalogListQuerySchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    includeRetired: z.boolean().optional(),
  })
  .strict()

export const catalogListPageSchema = z
  .object({
    items: catalogEntryDtoSchema.array(),
    nextOffset: z.number().int().nullable(),
  })
  .strict()

export type CatalogListQuery = z.infer<typeof catalogListQuerySchema>
export type CatalogListPage = z.infer<typeof catalogListPageSchema>
export type CatalogEntryDto = z.infer<typeof catalogEntryDtoSchema>
export type CatalogHistoryLabelDto = z.infer<typeof catalogHistoryLabelSchema>
export type CatalogCapabilities = z.infer<typeof catalogCapabilitiesSchema>

export interface CatalogSeedRow {
  id: string
  routerModelId: string
  displayName: string
  provider: string
  vendor: string
  description: string
  intelligenceLevel: 1 | 2 | 3 | 4
  intelligenceScore: number
  intelligenceBars: 1 | 2 | 3 | 4
  confidence: 'high' | 'medium' | 'low'
  evaluationNotes: string | null
  lastEvaluated: string | null
  creditCostMin: number
  creditCostMax: number
  creditTier: 'economy' | 'balanced' | 'premium' | 'adaptive'
  capabilities: CatalogCapabilities
  searchAliases: string[]
  contextWindow: number | null
  maxOutput: number | null
  pricingInput: number | null
  pricingOutput: number | null
  category: string
  speedClass: string
  routingProfile: 'lightweight' | 'coding' | 'reasoning' | 'general' | 'router'
  routingPriority: number
  isVirtual: boolean
  evaluationStatus:
    | 'legacy'
    | 'pending'
    | 'verified'
    | 'failed'
    | 'inconclusive'
  evaluationSuiteVersion: string | null
  evidenceRef: string | null
  visionStatus:
    | 'supported'
    | 'unsupported'
    | 'unverified'
    | 'inconclusive'
    | 'not-tested'
  visionEvidence: string | null
  provenance: string
  observedAt: string | null
  status: 'active' | 'inactive' | 'retired'
  disabledReason: string | null
  retiredAt: string | null
}

export function toCatalogEntryDto(
  row: CatalogSeedRow,
  aliasIds: readonly string[] = [],
): CatalogEntryDto {
  const hasPricing = row.pricingInput !== null || row.pricingOutput !== null
  return {
    id: row.id,
    routerModelId: row.routerModelId,
    displayName: row.displayName,
    provider: row.provider,
    vendor: row.vendor,
    description: row.description,
    intelligenceLevel: row.intelligenceLevel,
    intelligenceScore: row.intelligenceScore,
    intelligenceBars: row.intelligenceBars,
    confidence: confidenceSchema.parse(row.confidence),
    creditCost:
      row.evaluationStatus === 'legacy' || row.evaluationStatus === 'verified'
        ? row.creditCostMin === row.creditCostMax
          ? row.creditCostMin
          : { min: row.creditCostMin, max: row.creditCostMax }
        : null,
    creditTier: row.creditTier,
    capabilities: {
      ...row.capabilities,
      vision: row.visionStatus === 'supported' && row.capabilities.vision,
    },
    searchAliases: row.searchAliases,
    aliasIds: [...aliasIds],
    evaluationStatus: row.evaluationStatus,
    visionStatus: row.visionStatus,
    isDefault: row.isVirtual && row.routingProfile === 'router',
    isActive: row.status === 'active',
    status: row.status,
    disabledReason: row.disabledReason,
    metadata: {
      contextWindow: row.contextWindow,
      maxOutput: row.maxOutput,
      pricing: hasPricing
        ? {
            inputPerMillion: row.pricingInput,
            outputPerMillion: row.pricingOutput,
          }
        : null,
      category: row.category,
      speedClass: row.speedClass,
    },
  }
}
