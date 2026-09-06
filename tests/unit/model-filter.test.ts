import { describe, expect, it } from 'vitest'
import { filterModelCatalogEntry } from '../../src/lib/models/filter'
import type { ModelCatalogEntry } from '../../src/lib/models/types'

const mockCatalog: ModelCatalogEntry[] = [
  {
    id: 'auto',
    displayName: 'Auto',
    provider: 'zona-router',
    vendor: 'Zona',
    intelligenceLevel: 3,
    intelligenceScore: 88,
    intelligenceBars: 3,
    confidence: 'high',
    description: 'Automatically routes prompts to the best model based on complexity',
    isDefault: true,
    creditTier: 'adaptive',
    creditCost: { min: 1, max: 4 },
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
      structuredOutput: true,
    },
  },
  {
    id: 'gpt-5.6-sol',
    displayName: 'GPT 5.6 (Sol)',
    provider: 'codex',
    vendor: 'OpenAI',
    intelligenceLevel: 4,
    intelligenceScore: 96,
    intelligenceBars: 4,
    confidence: 'high',
    description: "OpenAI's high-tier flagship model",
    isDefault: false,
    creditTier: 'premium',
    creditCost: 4,
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
      structuredOutput: true,
    },
  },
  {
    id: 'gemini-3.7-flash-high',
    displayName: 'Gemini 3.7 Flash (High)',
    provider: 'antigravity',
    vendor: 'Google',
    intelligenceLevel: 3,
    intelligenceScore: 88,
    intelligenceBars: 3,
    confidence: 'high',
    description: "Google's next-gen hybrid reasoning model",
    isDefault: false,
    creditTier: 'balanced',
    creditCost: 3,
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
      structuredOutput: true,
    },
  },
  {
    id: 'qwen3.8-flash',
    displayName: 'Qwen 3.8 Flash',
    provider: 'qwen',
    vendor: 'Qwen',
    intelligenceLevel: 2,
    intelligenceScore: 72,
    intelligenceBars: 2,
    confidence: 'high',
    description: 'Fast multilingual model with Qwen thinking',
    isDefault: false,
    creditTier: 'balanced',
    creditCost: 2,
    capabilities: {
      text: true,
      vision: false,
      files: false,
      tools: true,
      reasoning: true,
      structuredOutput: true,
    },
  },
  {
    id: 'mimo-v2.5',
    displayName: 'MiMo V2.5',
    provider: 'mimo',
    vendor: 'Xiaomi',
    intelligenceLevel: 2,
    intelligenceScore: 64,
    intelligenceBars: 2,
    confidence: 'high',
    description: 'High-speed multimodal model with vision and 1M context',
    isDefault: false,
    creditTier: 'balanced',
    creditCost: 2,
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: false,
      structuredOutput: true,
    },
  },
]

describe('filterModelCatalogEntry', () => {
  it('returns all models when query is empty or whitespace', () => {
    expect(mockCatalog.filter((m) => filterModelCatalogEntry(m, ''))).toHaveLength(5)
    expect(mockCatalog.filter((m) => filterModelCatalogEntry(m, '   '))).toHaveLength(5)
  })

  it('filters by model display name case-insensitively', () => {
    const results = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'gem'))
    expect(results).toHaveLength(1)
    expect(results[0]?.id).toBe('gemini-3.7-flash-high')

    const upperResults = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'GEMINI'))
    expect(upperResults).toHaveLength(1)
    expect(upperResults[0]?.id).toBe('gemini-3.7-flash-high')
  })

  it('filters by vendor (e.g. xiaomi -> MiMo, openai -> GPT)', () => {
    const xiaomiResults = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'xiaomi'))
    expect(xiaomiResults).toHaveLength(1)
    expect(xiaomiResults[0]?.id).toBe('mimo-v2.5')

    const openaiResults = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'openai'))
    expect(openaiResults).toHaveLength(1)
    expect(openaiResults[0]?.id).toBe('gpt-5.6-sol')
  })

  it('filters by provider (e.g. codex, antigravity)', () => {
    const codexResults = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'codex'))
    expect(codexResults).toHaveLength(1)
    expect(codexResults[0]?.id).toBe('gpt-5.6-sol')
  })

  it('filters by model id (e.g. gpt-5.6, mimo)', () => {
    const solResults = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'sol'))
    expect(solResults).toHaveLength(1)
    expect(solResults[0]?.id).toBe('gpt-5.6-sol')
  })

  it('matches auto model when searching auto', () => {
    const autoResults = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'auto'))
    expect(autoResults.some((m) => m.id === 'auto')).toBe(true)
  })

  it('matches evaluation notes if available (e.g. alibaba -> qwen)', () => {
    const alibabaResults = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'alibaba'))
    expect(alibabaResults).toHaveLength(1)
    expect(alibabaResults[0]?.id).toBe('qwen3.8-flash')
  })

  it('returns empty array when no models match the query', () => {
    const noResults = mockCatalog.filter((m) => filterModelCatalogEntry(m, 'nonexistent-model-xyz'))
    expect(noResults).toHaveLength(0)
  })
})
