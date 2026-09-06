import type { ModelCatalogEntry } from './types'

const MODEL_SEARCH_ALIASES: Record<string, string[]> = {
  qwen: ['alibaba', 'aliyun', 'tongyi'],
  'qwen3.8-flash': ['alibaba', 'aliyun', 'tongyi'],
  'gpt-5.6-sol': ['openai', 'chatgpt', 'codex'],
  'gemini-3.7-flash-high': ['google', 'deepmind', 'antigravity'],
  'mimo-v2.5': ['xiaomi'],
  hy3: ['tencent', 'hunyuan'],
  'glm-5.3-flash': ['zhipu', 'zhipuai', 'chatglm'],
}

export function filterModelCatalogEntry(
  entry: ModelCatalogEntry,
  query: string,
): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true

  if (entry.displayName.toLowerCase().includes(normalized)) return true
  if (entry.id.toLowerCase().includes(normalized)) return true
  if (entry.vendor.toLowerCase().includes(normalized)) return true
  if (entry.provider.toLowerCase().includes(normalized)) return true
  if (entry.description.toLowerCase().includes(normalized)) return true

  const aliases = [
    ...(MODEL_SEARCH_ALIASES[entry.id] ?? []),
    ...(MODEL_SEARCH_ALIASES[entry.provider] ?? []),
  ]
  if (
    aliases.some(
      (alias) => alias.includes(normalized) || normalized.includes(alias),
    )
  ) {
    return true
  }

  if (entry.capabilities.vision && 'vision'.includes(normalized)) return true
  if (entry.capabilities.reasoning && 'reasoning'.includes(normalized))
    return true

  return false
}

export function getModelProviderName(
  entry?: { vendor?: string; provider?: string } | null,
  modelId?: string,
): string {
  if (entry?.vendor && entry.vendor.trim().length > 0) return entry.vendor

  if (entry?.provider && entry.provider !== 'zona-router') {
    const p = entry.provider.toLowerCase()
    if (p === 'antigravity' || p === 'google') return 'Google'
    if (p === 'codex' || p === 'openai') return 'OpenAI'
    if (p === 'anthropic') return 'Anthropic'
    if (p === 'qwen' || p === 'alibaba') return 'Qwen'
    if (p === 'xiaomi') return 'Xiaomi'
    if (p === 'tencent') return 'Tencent'
    if (p === 'zhipu') return 'Zhipu AI'
    return entry.provider
  }

  if (modelId) {
    const m = modelId.toLowerCase()
    if (m.includes('gemini') || m.includes('google')) return 'Google'
    if (
      m.includes('gpt') ||
      m.includes('openai') ||
      m.includes('o1') ||
      m.includes('o3')
    )
      return 'OpenAI'
    if (m.includes('claude') || m.includes('anthropic')) return 'Anthropic'
    if (m.includes('qwen')) return 'Qwen'
    if (m.includes('mimo') || m.includes('xiaomi')) return 'Xiaomi'
    if (m.includes('hunyuan') || m.includes('tencent')) return 'Tencent'
    if (m.includes('glm') || m.includes('zhipu')) return 'Zhipu AI'
  }

  return 'Zona'
}
