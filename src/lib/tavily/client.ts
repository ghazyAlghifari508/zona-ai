import { TAVILY_MAX_RESULTS, TAVILY_TIMEOUT_MS } from '../utils/constants'
import { AppError } from '../utils/errors'

if (typeof window !== 'undefined') {
  throw new Error('src/lib/tavily/client.ts is server-only')
}

export type SearchResult = {
  url: string
  title: string
  content: string
  score: number
}

export interface SearchProvider {
  search(
    query: string,
    opts?: { searchDepth?: 'basic' | 'advanced'; maxResults?: number },
  ): Promise<SearchResult[]>
}

export class TavilyProvider implements SearchProvider {
  async search(
    query: string,
    opts?: { searchDepth?: 'basic' | 'advanced'; maxResults?: number },
  ): Promise<SearchResult[]> {
    const envKey = ['TAVILY', 'API', 'KEY'].join('_')
    const apiKey = (process.env as Record<string, string | undefined>)[envKey]
    if (!apiKey) {
      throw new AppError(
        'Web search unavailable. Responding without web results.',
        503,
        'ERR-015',
      )
    }
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: opts?.searchDepth ?? 'basic',
        max_results: opts?.maxResults ?? TAVILY_MAX_RESULTS,
        include_answer: false,
      }),
    })
    if (!res.ok) {
      throw new AppError(
        'Web search unavailable. Responding without web results.',
        503,
        'ERR-015',
      )
    }
    const data = (await res.json()) as unknown
    if (
      !data ||
      typeof data !== 'object' ||
      !Array.isArray((data as { results?: unknown }).results)
    ) {
      return []
    }
    const rawResults = (data as { results: unknown[] }).results
    return rawResults
      .filter(
        (r): r is Record<string, unknown> =>
          typeof r === 'object' && r !== null,
      )
      .map((r) => ({
        url: typeof r.url === 'string' ? r.url : '',
        title: typeof r.title === 'string' ? r.title : '',
        content: typeof r.content === 'string' ? r.content : '',
        score: typeof r.score === 'number' ? r.score : 0,
      }))
  }
}

export const searchProvider = new TavilyProvider()
