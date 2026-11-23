import { adminModelIdSchema } from './admin-model-input'

const retained: readonly string[] = [
  'gh/gpt-4.1',
  'gh/gpt-4o',
  'ag/gemini-3.8-flash-high',
  'atria/Atria-Dawn-Preview',
]

export const p3Manifest = {
  version: 'p3-catalog-v1',
  retained,
  retire: [
    ['cx/gpt-5.6-terra'],
    ['cx/gpt-5.6-luna'],
    ['cx/gpt-5.6-sol', 'gpt-5.6-sol'],
    ['cx/gpt-5.5'],
    ['cx/gpt-5.4'],
    ['ag/gemini-3.7-flash-high'],
    ['ag/gemini-3.7-flash-low'],
    ['ag/gemini-3.6-flash-high'],
    ['ag/gemini-pro-agent'],
    ['ag/claude-opus-4-6-thinking'],
    ['ag/claude-sonnet-4-6'],
    ['gcli/grok-4.6'],
    ['gcli/grok-4.5'],
    ['bai/qwen3.8-flash', 'qwen3.8-flash'],
    ['bai/mimo-v2.5', 'mimo-v2.5'],
    ['bai/hy3', 'hy3'],
    ['bai/glm-5.3-flash', 'glm-5.3-flash'],
    ['gcli/grok-4.7-high'],
    ['oc/muse-spark-1.2-contributor-free'],
    ['oc/muse-spark-1.3-contributor-free'],
    ['cbai/deepseek-v4.1-flash'],
  ].map(([routerModelId, legacyId = routerModelId]) => ({
    routerModelId,
    legacyId,
  })),
  added: [
    ['nous/tencent/hy4-flash:free', 'HY4 Flash'],
    ['cor-prod/deepseek-v4-1-flash-1017', 'DeepSeek V4.1 Flash'],
    ['cent-ai/qwen3.8-flash', 'Qwen 3.8 Flash'],
    ['ic-prod/mercury-3', 'Mercury 3'],
    ['zro-prod/zro/deepseek-v4.1-flash', 'DeepSeek V4.1 Flash'],
    ['nvidia/minimaxai/minimax-m3.1-flash', 'MiniMax M3.1 Flash'],
    ['cx/gpt-6.2-sol', 'GPT 6.2 Sol'],
    ['cx/gpt-6.1-sol', 'GPT 6.1 Sol'],
    ['cx/gpt-6.1-terra', 'GPT 6.1 Terra'],
    ['cx/gpt-6-luna', 'GPT 6 Luna'],
    ['gcli/grok-4.7', 'Grok 4.7'],
    ['cc/claude-opus-5-5', 'Claude Opus 5.5'],
    ['cc/claude-sonnet-5-5', 'Claude Sonnet 5.5'],
    ['tokenharbor/mimo-v2.6-flash:free', 'MiMo V2.6 Flash'],
  ].map(([routerModelId, suggestedLabel]) => ({
    routerModelId,
    suggestedLabel,
  })),
}

export function validateExactRoutes(input: readonly string[]): string[] {
  const routes = input.map((id) => {
    if (id !== id.trim() || !id.includes('/'))
      throw new Error('Expected an exact physical gateway route')
    return adminModelIdSchema.parse(id)
  })
  if (!routes.length || new Set(routes).size !== routes.length)
    throw new Error('Expected unique physical routes')
  return routes
}

export const p3Routes = validateExactRoutes([
  ...p3Manifest.retained,
  ...p3Manifest.added.map((row) => row.routerModelId),
])

export function inspectP3Scope(
  rows: readonly { id: string; routerModelId: string }[],
) {
  const expected = new Set(['auto', ...p3Routes])
  const byId = new Map(rows.map((row) => [row.id, row.routerModelId]))
  const missing = [...expected].filter((id) => !byId.has(id))
  const drift = rows
    .filter((row) => !expected.has(row.id))
    .map((row) => row.id)
    .sort()
  const conflicts = rows
    .filter((row) => expected.has(row.id) && row.id !== row.routerModelId)
    .map((row) => row.id)
    .sort()
  return { missing, drift, conflicts }
}
