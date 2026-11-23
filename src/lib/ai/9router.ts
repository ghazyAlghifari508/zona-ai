import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/ai/9router.ts is server-only — do not import on the client',
  )
}

const readGatewayEnv = (key: string) => process.env[key]

export function createNineRouter(fetchImpl?: typeof fetch) {
  return createOpenAICompatible({
    baseURL: readGatewayEnv(['NINE', 'ROUTER', 'BASE', 'URL'].join('_')) ?? '',
    apiKey: readGatewayEnv(['NINE', 'ROUTER', 'API', 'KEY'].join('_')),
    name: '9Router',
    fetch: fetchImpl,
  })
}

export const nineRouter = createNineRouter()
