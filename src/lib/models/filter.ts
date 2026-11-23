import type { ModelCatalogEntry } from './types'

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

  const aliases = entry.searchAliases ?? []
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
    if (p === 'antigravity' || p === 'google' || p === 'gemini') return 'Google'
    if (p === 'codex' || p === 'openai') return 'OpenAI'
    if (p === 'anthropic' || p === 'claude') return 'Anthropic'
    if (p === 'xai' || p === 'grok') return 'xAI'
    if (p === 'qwen' || p === 'alibaba') return 'Qwen'
    if (p === 'xiaomi' || p === 'mimo') return 'Xiaomi'
    if (p === 'tencent' || p === 'hunyuan') return 'Tencent'
    if (p === 'zhipu' || p === 'glm') return 'Zhipu AI'
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
    if (m.includes('grok') || m.includes('xai')) return 'xAI'
    if (m.includes('qwen')) return 'Qwen'
    if (m.includes('mimo') || m.includes('xiaomi')) return 'Xiaomi'
    if (m.includes('hunyuan') || m.includes('tencent')) return 'Tencent'
    if (m.includes('glm') || m.includes('zhipu')) return 'Zhipu AI'
  }

  return 'Zona'
}
