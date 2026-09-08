import type { ModelCatalogEntry } from './types'

const MODEL_SEARCH_ALIASES: Record<string, string[]> = {
  // Existing / ecosystem
  qwen: ['alibaba', 'aliyun', 'tongyi'],
  'qwen3.8-flash': ['alibaba', 'aliyun', 'tongyi'],
  'gpt-5.6-sol': ['openai', 'chatgpt', 'codex'],
  'gemini-3.7-flash-high': ['google', 'deepmind', 'antigravity'],
  'mimo-v2.5': ['xiaomi'],
  hy3: ['tencent', 'hunyuan'],
  'glm-5.3-flash': ['zhipu', 'zhipuai', 'chatglm'],

  // OpenAI
  'cx/gpt-5.6-terra': ['openai', 'chatgpt', 'codex', 'terra', 'gpt-5.6-terra'],
  'cx/gpt-5.6-luna': ['openai', 'chatgpt', 'codex', 'luna', 'gpt-5.6-luna'],
  'cx/gpt-5.5': ['openai', 'chatgpt', 'codex', 'gpt-5.5'],
  'cx/gpt-5.4': ['openai', 'chatgpt', 'codex', 'gpt-5.4'],
  'gh/gpt-4.1': ['openai', 'chatgpt', 'codex', 'gpt-4.1'],
  'gh/gpt-4o': ['openai', 'chatgpt', 'codex', 'gpt-4o', 'omni'],

  // Google
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
    'gemini-pro-agent',
  ],

  // Anthropic
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

  // xAI
  'gcli/grok-4.6': ['xai', 'grok', 'grok-4.6', 'elon'],
  'gcli/grok-4.5': ['xai', 'grok', 'grok-4.5'],
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
