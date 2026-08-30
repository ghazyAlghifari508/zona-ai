import type { ModelCatalogEntry, ModelRegistryEntry } from './types'

export const modelRegistry: ModelRegistryEntry[] = [
  {
    id: 'auto',
    routerModelId: 'auto',
    displayName: 'Auto',
    provider: 'zona-router',
    vendor: 'Zona',
    intelligenceLevel: 3,
    description:
      'Automatically routes prompts to the best model based on complexity and task type',
    enabled: true,
    isDefault: true,
    creditCost: { min: 1, max: 4 },
    creditTier: 'adaptive',
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
    },
    metadata: {
      contextWindow: 1048576,
      maxOutput: 128000,
      pricing: null,
      category: 'smart-router',
      speedClass: 'adaptive',
    },
    routingRules: {
      lightweight: 'ag/gemini-3.7-flash-low',
      reasoning: 'ag/gemini-3.7-flash-high',
      coding: 'cx/gpt-5.6-sol',
    },
  },
  {
    id: 'gemini-3.7-flash-high',
    routerModelId: 'ag/gemini-3.7-flash-high',
    displayName: 'Gemini 3.7 Flash (High)',
    provider: 'antigravity',
    vendor: 'Google',
    intelligenceLevel: 3,
    description: "Google's next-gen hybrid reasoning model",
    enabled: true,
    creditCost: 4,
    creditTier: 'balanced',
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
    },
    metadata: {
      contextWindow: 1048576,
      maxOutput: 65536,
      pricing: null,
      category: 'reasoning',
      speedClass: 'fast',
    },
  },
  {
    id: 'gpt-5.6-sol',
    routerModelId: 'cx/gpt-5.6-sol',
    displayName: 'GPT 5.6 (Sol)',
    provider: 'codex',
    vendor: 'OpenAI',
    intelligenceLevel: 4,
    description: "OpenAI's high-tier flagship model",
    enabled: true,
    creditCost: 15,
    creditTier: 'premium',
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
    },
    metadata: {
      contextWindow: 372000,
      maxOutput: 128000,
      pricing: null,
      category: 'flagship',
      speedClass: 'medium',
    },
  },
  {
    id: 'deepseek-v4-flash-vision-exp',
    routerModelId: 'bai/deepseek-v4-flash-vision-exp',
    displayName: 'DeepSeek V4 Flash Vision (Exp)',
    provider: 'deepseek',
    vendor: 'DeepSeek',
    intelligenceLevel: 3,
    description: 'Experimental fast vision model with DeepSeek reasoning',
    enabled: true,
    creditCost: 4,
    creditTier: 'balanced',
    capabilities: {
      text: true,
      vision: true,
      files: true,
      tools: true,
      reasoning: true,
    },
    metadata: {
      contextWindow: 1000000,
      maxOutput: 384000,
      pricing: null,
      category: 'reasoning',
      speedClass: 'fast',
    },
  },
  {
    id: 'qwen3.8-flash',
    routerModelId: 'bai/qwen3.8-flash',
    displayName: 'Qwen 3.8 Flash',
    provider: 'qwen',
    vendor: 'Qwen',
    intelligenceLevel: 3,
    description: 'Fast multilingual model with Qwen thinking',
    enabled: true,
    creditCost: 3,
    creditTier: 'balanced',
    capabilities: {
      text: true,
      vision: false,
      files: false,
      tools: true,
      reasoning: true,
    },
    metadata: {
      contextWindow: 262144,
      maxOutput: 64000,
      pricing: null,
      category: 'reasoning',
      speedClass: 'fast',
    },
  },
]

export function getAvailableModels(): ModelRegistryEntry[] {
  return modelRegistry.filter((m) => m.enabled)
}

export function getModelCatalog(): ModelCatalogEntry[] {
  return getAvailableModels().map((m) => ({
    id: m.id,
    displayName: m.displayName,
    provider: m.provider,
    vendor: m.vendor,
    intelligenceLevel: m.intelligenceLevel,
    description: m.description,
    isDefault: m.isDefault ?? false,
    creditTier: m.creditTier,
    creditCost: m.creditCost,
    capabilities: m.capabilities,
  }))
}

export function getModelById(id: string): ModelRegistryEntry {
  const m = modelRegistry.find((x) => x.id === id && x.enabled)
  if (!m) throw new Error(`ERR-003: model ${id} not available`)
  return m
}

export function isVisionCapable(id: string): boolean {
  return getModelById(id).capabilities.vision
}
