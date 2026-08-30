export interface ModelRegistryEntry {
  id: string
  routerModelId: string
  displayName: string
  provider: string
  vendor: string
  intelligenceLevel: 1 | 2 | 3 | 4
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
  displayName: string
  provider: string
  vendor: string
  intelligenceLevel: ModelRegistryEntry['intelligenceLevel']
  description: string
  isDefault: boolean
  creditTier: ModelRegistryEntry['creditTier']
  creditCost: ModelRegistryEntry['creditCost']
  capabilities: ModelRegistryEntry['capabilities']
}
