if (typeof window !== 'undefined') {
  throw new Error('src/lib/rag/extract.ts is server-only')
}

import { getObject } from '../r2/client'

export async function extractText({
  r2Key,
  mimeType,
}: {
  r2Key: string
  mimeType: string
}): Promise<string> {
  if (mimeType.startsWith('image/')) {
    return ''
  }

  const { body } = await getObject(r2Key)
  const buf = body as Buffer

  try {
    if (mimeType === 'application/pdf') {
      const u8 = Buffer.isBuffer(buf)
        ? new Uint8Array(buf)
        : (buf as Uint8Array)
      const { extractText: pdfExtract } = await import('unpdf')
      const { text } = await pdfExtract(u8, {
        mergePages: true,
      } as unknown as never)
      const joined = Array.isArray(text)
        ? (text as string[]).join('\n')
        : (text as string)
      return joined.trim()
    }

    if (
      mimeType ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      const mammoth = await import('mammoth')
      const { value } = await mammoth.extractRawText({ buffer: buf })
      return value.trim()
    }

    if (mimeType === 'text/plain' || mimeType === 'text/csv') {
      return buf.toString('utf8').trim()
    }

    return buf.toString('utf8').trim()
  } catch (_e) {
    const err = new Error(
      'Could not process this document. It may be corrupted or password-protected.',
    ) as Error & { code: string }
    err.code = 'ERR-013'
    throw err
  }
}
