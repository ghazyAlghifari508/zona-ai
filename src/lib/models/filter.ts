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
