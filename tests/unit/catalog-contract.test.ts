import { describe, expect, it } from 'vitest'
import {
  type CatalogSeedRow,
  catalogEntryDtoSchema,
  catalogHistoryLabelSchema,
  toCatalogEntryDto,
} from '../../src/lib/models/catalog-contract'

const seedRow: CatalogSeedRow = {
  id: 'cx/gpt-5.6-sol',
  routerModelId: 'cx/gpt-5.6-sol',
  displayName: 'GPT 5.6 Sol',
  provider: 'codex',
  vendor: 'OpenAI',
  description: 'legacy description',
  intelligenceLevel: 4,
  intelligenceScore: 96,
  intelligenceBars: 4,
  confidence: 'high',
  evaluationNotes: null,
  lastEvaluated: '2026-09-09',
  creditCostMin: 15,
  creditCostMax: 15,
  creditTier: 'premium',
  capabilities: {
    text: true,
    vision: true,
    files: true,
    tools: true,
    reasoning: true,
    structuredOutput: true,
  },
  searchAliases: ['gpt-5.6-sol', 'openai'],
  contextWindow: 400000,
  maxOutput: 128000,
  pricingInput: null,
  pricingOutput: null,
  category: 'flagship-reasoning',
  speedClass: 'medium',
  routingProfile: 'coding',
  routingPriority: 1,
  isVirtual: false,
  evaluationStatus: 'legacy',
  evaluationSuiteVersion: null,
  evidenceRef: null,
  visionStatus: 'supported',
  visionEvidence: null,
  provenance: 'legacy-registry-2026-09',
  observedAt: '2026-09-09',
  status: 'active',
  disabledReason: null,
  retiredAt: null,
}

describe('catalog DTO boundary', () => {
  it('maps a catalog row to a safe DTO without secrets or internal notes', () => {
    const dto = toCatalogEntryDto(seedRow)
    expect(catalogEntryDtoSchema.safeParse(dto).success).toBe(true)
    expect(Object.keys(dto).sort()).toEqual(
      [
        'aliasIds',
        'capabilities',
        'confidence',
        'creditCost',
        'creditTier',
        'description',
        'disabledReason',
        'displayName',
        'evaluationStatus',
        'id',
        'intelligenceBars',
        'intelligenceLevel',
        'intelligenceScore',
        'isActive',
        'isDefault',
        'metadata',
        'provider',
        'routerModelId',
        'searchAliases',
        'status',
        'vendor',
        'visionStatus',
      ].sort(),
    )
    expect(JSON.stringify(dto)).not.toContain('evaluationNotes')
    expect(JSON.stringify(dto)).not.toContain('provenance')
  })

  it('rejects a DTO carrying an unexpected credential field', () => {
    const parsed = catalogEntryDtoSchema.safeParse({
      ...toCatalogEntryDto(seedRow),
      apiKey: 'secret',
    })
    expect(parsed.success).toBe(false)
  })

  it('keeps retired models in the historical label contract', () => {
    const label = {
      id: seedRow.id,
      displayName: seedRow.displayName,
      routerModelId: seedRow.routerModelId,
      status: 'retired' as const,
    }
    expect(catalogHistoryLabelSchema.safeParse(label).success).toBe(true)
    expect(
      catalogHistoryLabelSchema.safeParse({ ...label, status: 'active' })
        .success,
    ).toBe(true)
  })
})
