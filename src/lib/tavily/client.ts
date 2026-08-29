import { TAVILY_MAX_RESULTS } from '../utils/constants'
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

type TavilyApiResponse = {
  results: Array<{
    url: string
    title: string
    content: string
    score: number
  }>
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
    const data = (await res.json()) as TavilyApiResponse
    return data.results.map((r) => ({
      url: r.url,
      title: r.title,
      content: r.content,
      score: r.score,
    }))
  }
}

export const searchProvider = new TavilyProvider()
