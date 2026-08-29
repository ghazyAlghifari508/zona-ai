/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockResults = [
  {
    url: 'https://example.com/article-1',
    title: 'Understanding RAG Systems',
    content: 'RAG combines retrieval...',
    score: 0.95,
  },
  {
    url: 'https://example.com/article-2',
    title: 'AI Model Comparison Guide',
    content: 'Comparing...',
    score: 0.88,
  },
]

describe('tavily provider', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ results: mockResults }),
      })) as unknown as typeof fetch,
    )
  })

  it('search returns 2 results with score', async () => {
    const { searchProvider } = await import('../../src/lib/tavily/client')
    const r = await searchProvider.search('hello')
    expect(r.length).toBe(2)
    expect(r[0].score).toBe(0.95)
    expect(r[0].url).toContain('example.com')
    expect(r[1].title).toBe('AI Model Comparison Guide')
  })

  it('passes searchDepth basic', async () => {
    const { searchProvider } = await import('../../src/lib/tavily/client')
    const spy = vi.mocked(global.fetch)
    await searchProvider.search('hi', { searchDepth: 'basic' })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('api.tavily.com'),
      expect.objectContaining({ body: expect.stringContaining('basic') }),
    )
  })

  it('passes searchDepth advanced', async () => {
    const { searchProvider } = await import('../../src/lib/tavily/client')
    const spy = vi.mocked(global.fetch)
    await searchProvider.search('hi', { searchDepth: 'advanced' })
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('api.tavily.com'),
      expect.objectContaining({ body: expect.stringContaining('advanced') }),
    )
  })

  it('throws ERR-015 on fetch failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        json: async () => ({}),
      })) as unknown as typeof fetch,
    )
    const { searchProvider } = await import('../../src/lib/tavily/client')
    await expect(searchProvider.search('fail')).rejects.toMatchObject({
      code: 'ERR-015',
    })
  })
})
