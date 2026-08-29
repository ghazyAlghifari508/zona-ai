/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('embed', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('embedTexts returns 2 vectors 1536', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          ({
            ok: true,
            json: async () => ({
              data: [
                { embedding: Array(1536).fill(0.1) },
                { embedding: Array(1536).fill(0.2) },
              ],
            }),
          }) as unknown as Response,
      ),
    )
    const { embedTexts } = await import('../../src/lib/rag/embed')
    const v = await embedTexts(['hi', 'hello'])
    expect(v.length).toBe(2)
    expect(v[0].length).toBe(1536)
    expect(v[1][0]).toBe(0.2)
  })

  it('embedQuery calls embedTexts once', async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          json: async () => ({ data: [{ embedding: Array(1536).fill(0.5) }] }),
        }) as unknown as Response,
    )
    vi.stubGlobal('fetch', fetchMock)
    const { embedQuery } = await import('../../src/lib/rag/embed')
    const v = await embedQuery('query')
    expect(v.length).toBe(1536)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toContain('/embeddings')
  })

  it('throws ERR-014 on API fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500 }) as unknown as Response),
    )
    const { embedTexts } = await import('../../src/lib/rag/embed')
    await expect(embedTexts(['hi'])).rejects.toThrow(
      /ERR-014|Document indexing failed/,
    )
  })
})
