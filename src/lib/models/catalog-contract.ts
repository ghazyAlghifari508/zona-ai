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
])

export const catalogEntryDtoSchema = z
  .object({
    id: z.string().min(1),
    routerModelId: z.string().min(1),
    displayName: z.string().min(1),
    provider: z.string().min(1),
    vendor: z.string().min(1),
    description: z.string(),
    intelligenceLevel: z.number().int().min(1).max(4),
    intelligenceScore: z.number().int(),
    intelligenceBars: z.number().int().min(1).max(4),
    creditCost: creditCostSchema,
    creditTier: creditTierSchema,
    capabilities: catalogCapabilitiesSchema,
    searchAliases: z.array(z.string()),
    evaluationStatus: evaluationStatusSchema,
    visionStatus: visionStatusSchema,
    isDefault: z.boolean(),
    isActive: z.boolean(),
    disabledReason: z.string().nullable(),
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

export function toCatalogEntryDto(row: CatalogSeedRow): CatalogEntryDto {
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
    creditCost:
      row.creditCostMin === row.creditCostMax
        ? row.creditCostMin
        : { min: row.creditCostMin, max: row.creditCostMax },
    creditTier: row.creditTier,
    capabilities: row.capabilities,
    searchAliases: row.searchAliases,
    evaluationStatus: row.evaluationStatus,
    visionStatus: row.visionStatus,
    isDefault: row.id === 'auto',
    isActive: row.status === 'active',
    disabledReason: row.disabledReason,
  }
}
