import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

if (typeof window !== 'undefined') {
  throw new Error('src/lib/ai/9router.ts is server-only — do not import on the client')
}

export const nineRouter = createOpenAICompatible({
  baseURL: process.env.NINE_ROUTER_BASE_URL as string,
  apiKey: process.env.NINE_ROUTER_API_KEY as string,
  name: '9Router',
})
