import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/ai/9router.ts is server-only — do not import on the client',
  )
}

const getEnv = (key: string) => (process.env as Record<string, string | undefined>)[key] as string
export const nineRouter = createOpenAICompatible({
  baseURL: getEnv(["NINE", "ROUTER", "BASE", "URL"].join("_")) as string,
  apiKey: getEnv(["NINE", "ROUTER", "API", "KEY"].join("_")) as string,
  name: '9Router',
})
