export interface ModelRegistryEntry {
  id: string
  routerModelId: string
  displayName: string
  provider: string
  vendor: string
  intelligenceLevel: 1 | 2 | 3 | 4
  intelligenceScore: number
  intelligenceBars: 1 | 2 | 3 | 4
  confidence: 'high' | 'medium' | 'low'
  evaluationNotes?: string
  lastEvaluated?: string
  description: string
  enabled: boolean
  isDefault?: boolean
  creditCost: number | { min: number; max: number }
  creditTier: 'economy' | 'balanced' | 'premium' | 'adaptive'
  capabilities: {
    text: boolean
    vision: boolean
    files: boolean
    tools: boolean
    reasoning: boolean
    structuredOutput: boolean
  }
  metadata: {
    contextWindow: number | null
    maxOutput?: number
    pricing: {
      inputPerMillion: number | null
      outputPerMillion: number | null
    } | null
    category: string
    speedClass: string
  }
  routingRules?: { lightweight: string; reasoning: string; coding: string }
}

export interface ModelCatalogEntry {
  id: string
  routerModelId?: string
  displayName: string
  provider: string
  vendor: string
  intelligenceLevel: ModelRegistryEntry['intelligenceLevel']
  intelligenceScore: number
  intelligenceBars: ModelRegistryEntry['intelligenceBars']
  confidence: ModelRegistryEntry['confidence']
  description: string
  isDefault: boolean
  creditTier: ModelRegistryEntry['creditTier']
  creditCost: ModelRegistryEntry['creditCost'] | null
  capabilities: ModelRegistryEntry['capabilities']
  isActive?: boolean
  disabledReason?: string | null
  status?: 'active' | 'inactive' | 'retired'
  evaluationStatus?:
    | 'legacy'
    | 'pending'
    | 'verified'
    | 'failed'
    | 'inconclusive'
  aliasIds?: string[]
  searchAliases?: string[]
  metadata?: {
    contextWindow: number | null
    maxOutput: number | null
    pricing: {
      inputPerMillion: number | null
      outputPerMillion: number | null
    } | null
    category: string
    speedClass: string
  }
}
