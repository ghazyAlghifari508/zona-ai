import type { CatalogSeedRow } from './catalog-contract'
import { modelRegistry } from './registry'

export const LEGACY_IDENTITY_ALIASES: Readonly<Record<string, string>> = {
  'gpt-5.6-sol': 'cx/gpt-5.6-sol',
  'qwen3.8-flash': 'bai/qwen3.8-flash',
}

const LEGACY_SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  qwen: ['alibaba', 'aliyun', 'tongyi'],
  'qwen3.8-flash': ['alibaba', 'aliyun', 'tongyi'],
  'gpt-5.6-sol': ['openai', 'chatgpt', 'codex', 'sol', 'gpt-5.6-sol'],
  'gemini-3.7-flash-high': ['google', 'deepmind', 'antigravity'],
  'mimo-v2.5': ['xiaomi'],
  hy3: ['tencent', 'hunyuan'],
  'glm-5.3-flash': ['zhipu', 'zhipuai', 'chatglm'],
  'cx/gpt-5.6-terra': ['openai', 'chatgpt', 'codex', 'terra', 'gpt-5.6-terra'],
  'cx/gpt-5.6-luna': ['openai', 'chatgpt', 'codex', 'luna', 'gpt-5.6-luna'],
  'cx/gpt-5.5': ['openai', 'chatgpt', 'codex', 'gpt-5.5'],
  'cx/gpt-5.4': ['openai', 'chatgpt', 'codex', 'gpt-5.4'],
  'gh/gpt-4.1': ['openai', 'chatgpt', 'codex', 'gpt-4.1'],
  'gh/gpt-4o': ['openai', 'chatgpt', 'codex', 'gpt-4o', 'omni'],
  'ag/gemini-3.8-flash-high': [
    'google',
    'deepmind',
    'antigravity',
    'gemini',
    'gemini-3.8-flash-high',
  ],
  'ag/gemini-3.7-flash-high': [
    'google',
    'deepmind',
    'antigravity',
    'gemini',
    'gemini-3.7-flash-high',
  ],
  'ag/gemini-3.6-flash-high': [
    'google',
    'deepmind',
    'antigravity',
    'gemini',
    'gemini-3.6-flash-high',
  ],
  'ag/gemini-pro-agent': [
    'google',
    'deepmind',
    'antigravity',
    'gemini',
    'gemini-3.1-pro',
    'gemini-pro-agent',
    '3.1',
  ],
  'ag/claude-opus-4-6-thinking': [
    'anthropic',
    'claude',
    'opus',
    'claude-opus-4-6-thinking',
  ],
  'ag/claude-sonnet-4-6': [
    'anthropic',
    'claude',
    'sonnet',
    'claude-sonnet-4-6',
  ],
  'gcli/grok-4.6': ['xai', 'grok', 'grok-4.6', 'elon'],
  'gcli/grok-4.5': ['xai', 'grok', 'grok-4.5'],
}

function collectSearchAliases(
  id: string,
  routerModelId: string,
  vendor: string,
): string[] {
  const aliases = new Set<string>([id, routerModelId, vendor])
  for (const [alias, target] of Object.entries(LEGACY_IDENTITY_ALIASES)) {
    if (target === routerModelId) aliases.add(alias)
  }
  for (const key of [id, routerModelId, LEGACY_IDENTITY_ALIASES[id] ?? id]) {
    for (const alias of LEGACY_SEARCH_ALIASES[key] ?? []) aliases.add(alias)
  }
  return Array.from(aliases)
}

export function buildLegacyCatalogSeed(): CatalogSeedRow[] {
  const auto = modelRegistry.find((entry) => entry.id === 'auto')
  const rules = auto?.routingRules

  return modelRegistry.map((entry) => {
    const cost =
      typeof entry.creditCost === 'number'
        ? { min: entry.creditCost, max: entry.creditCost }
        : entry.creditCost
    const profile: CatalogSeedRow['routingProfile'] =
      entry.id === 'auto'
        ? 'router'
        : entry.routerModelId === rules?.lightweight
          ? 'lightweight'
          : entry.routerModelId === rules?.coding
            ? 'coding'
            : entry.routerModelId === rules?.reasoning
              ? 'reasoning'
              : 'general'

    const canonicalId = entry.id === 'auto' ? 'auto' : entry.routerModelId
    return {
      id: canonicalId,
      routerModelId: entry.routerModelId,
      displayName: entry.displayName,
      provider: entry.provider,
      vendor: entry.vendor,
      description: entry.description,
      intelligenceLevel: entry.intelligenceLevel,
      intelligenceScore: entry.intelligenceScore,
      intelligenceBars: entry.intelligenceBars,
      confidence: entry.confidence,
      evaluationNotes: entry.evaluationNotes ?? null,
      lastEvaluated: entry.lastEvaluated ?? null,
      creditCostMin: cost.min,
      creditCostMax: cost.max,
      creditTier: entry.creditTier,
      capabilities: entry.capabilities,
      searchAliases: collectSearchAliases(
        entry.id,
        entry.routerModelId,
        entry.vendor,
      ),
      contextWindow: entry.metadata.contextWindow,
      maxOutput: entry.metadata.maxOutput ?? null,
      pricingInput: entry.metadata.pricing?.inputPerMillion ?? null,
      pricingOutput: entry.metadata.pricing?.outputPerMillion ?? null,
      category: entry.metadata.category,
      speedClass: entry.metadata.speedClass,
      routingProfile: profile,
      routingPriority: entry.id === 'auto' ? 0 : 100 - entry.intelligenceScore,
      isVirtual: entry.id === 'auto',
      evaluationStatus: 'legacy',
      evaluationSuiteVersion: null,
      evidenceRef: null,
      visionStatus: entry.capabilities.vision ? 'unverified' : 'unsupported',
      visionEvidence: entry.capabilities.vision
        ? 'legacy-registry-claim'
        : null,
      provenance: 'legacy-registry-2026-09',
      observedAt: entry.lastEvaluated ?? null,
      status: 'active',
      disabledReason: null,
      retiredAt: null,
    }
  })
}
