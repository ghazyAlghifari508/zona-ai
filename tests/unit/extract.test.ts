/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/r2/client', () => ({
  getObject: vi.fn(async () => ({
    body: Buffer.from('%PDF-1.4 Hello world'),
    contentType: 'application/pdf',
  })),
}))

vi.mock('unpdf', () => ({
  extractText: vi.fn(async (buf: Uint8Array) => {
    const str = Buffer.from(buf).toString('utf8')
    if (str.includes('corrupted-not-pdf') || str.includes('encrypted')) {
      throw new Error('Invalid PDF structure')
    }
    // Simulate extracting Hello world if present
    if (str.includes('Hello world')) {
      return { text: 'Hello world', totalPages: 1 }
    }
    // For other buffers, return text as buffer string trimmed
    return { text: str, totalPages: 1 }
  }),
}))

vi.mock('mammoth', () => ({
  extractRawText: vi.fn(async ({ buffer }: { buffer: Buffer }) => {
    const str = buffer.toString('utf8')
    if (str.includes('PK')) {
      return { value: 'Hello from docx' }
    }
    return { value: str }
  }),
}))

import { getObject } from '../../src/lib/r2/client'
import { extractText } from '../../src/lib/rag/extract'

describe('extract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pdf extracts Hello world', async () => {
    vi.mocked(getObject).mockResolvedValueOnce({
      body: Buffer.from('%PDF-1.4 Hello world'),
      contentType: 'application/pdf',
    } as never)
    const t = await extractText({ r2Key: 'k', mimeType: 'application/pdf' })
    expect(t).toContain('Hello world')
  })

  it('corrupted pdf throws ERR-013', async () => {
    vi.mocked(getObject).mockResolvedValueOnce({
      body: Buffer.from('corrupted-not-pdf'),
      contentType: 'application/pdf',
    } as never)
    await expect(
      extractText({ r2Key: 'k', mimeType: 'application/pdf' }),
    ).rejects.toMatchObject({
      code: 'ERR-013',
    })
  })

  it('image skip returns empty', async () => {
    const t = await extractText({ r2Key: 'k', mimeType: 'image/png' })
    expect(t).toBe('')
    expect(getObject).not.toHaveBeenCalled()
  })

  it('docx extracts via mammoth', async () => {
    const fakeDocx = Buffer.from('PK fake docx')
    vi.mocked(getObject).mockResolvedValueOnce({
      body: fakeDocx,
      contentType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    } as never)
    const t = await extractText({
      r2Key: 'k',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    expect(t).toContain('Hello from docx')
  })

  it('txt extracts utf8', async () => {
    vi.mocked(getObject).mockResolvedValueOnce({
      body: Buffer.from('hello txt content'),
      contentType: 'text/plain',
    } as never)
    const t = await extractText({ r2Key: 'k', mimeType: 'text/plain' })
    expect(t).toBe('hello txt content')
  })

  it('csv extracts utf8', async () => {
    vi.mocked(getObject).mockResolvedValueOnce({
      body: Buffer.from('a,b,c\n1,2,3'),
      contentType: 'text/csv',
    } as never)
    const t = await extractText({ r2Key: 'k', mimeType: 'text/csv' })
    expect(t).toBe('a,b,c\n1,2,3')
  })
})
