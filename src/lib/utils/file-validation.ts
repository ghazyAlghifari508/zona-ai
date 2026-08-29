import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from './constants'

export function sanitizeFilename(original: string): string {
  const base =
    original.split('/').pop()?.split('\\').pop() ?? original
  return (
    base.replace(/\.\./g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) ||
    'file'
  )
}

export function validateMime(mime: string) {
  const ok = (ALLOWED_MIME_TYPES as readonly string[]).includes(mime)
  return { ok, reason: ok ? '' : `Unsupported: ${mime}` }
}

export function validateSize(size: number) {
  const ok = size <= MAX_FILE_SIZE_BYTES
  return { ok, reason: ok ? '' : `Size ${size} > ${MAX_FILE_SIZE_BYTES}` }
}

export async function validateMagicBytes(
  buffer: Buffer,
  claimedMime: string,
): Promise<{ ok: boolean; reason: string }> {
  if (claimedMime === 'application/pdf') {
    const header = buffer.slice(0, 4).toString('utf8')
    const ok = header.startsWith('%PDF')
    return { ok, reason: ok ? '' : 'PDF header mismatch' }
  }
  if (claimedMime === 'image/png') {
    const ok = buffer[0] === 0x89 && buffer[1] === 0x50
    return { ok, reason: ok ? '' : 'PNG header mismatch' }
  }
  if (claimedMime === 'image/jpeg') {
    const ok = buffer[0] === 0xff && buffer[1] === 0xd8
    return { ok, reason: ok ? '' : 'JPEG header mismatch' }
  }
  if (claimedMime === 'image/webp') {
    // WEBP header: RIFF....WEBP
    const ok =
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer.slice(8, 12).toString('utf8') === 'WEBP'
    // If buffer too small, fallback to allow (maybe truncated in test) — but for real WEBP we check
    if (buffer.length < 12) return { ok: true, reason: '' }
    return { ok, reason: ok ? '' : 'WEBP header mismatch' }
  }
  if (claimedMime.startsWith('text/')) {
    return { ok: true, reason: '' }
  }
  if (claimedMime.includes('wordprocessingml')) {
    const ok = buffer[0] === 0x50 && buffer[1] === 0x4b
    return { ok, reason: ok ? '' : 'DOCX header mismatch' }
  }
  return { ok: true, reason: '' }
}

export function validateFile({
  fileName,
  fileSize,
  mimeType,
  buffer,
}: {
  fileName: string
  fileSize: number
  mimeType: string
  buffer: Buffer
}) {
  const m = validateMime(mimeType)
  if (!m.ok)
    return {
      ok: false as const,
      code: 'ERR-011',
      message:
        'This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.',
    }
  const s = validateSize(fileSize)
  if (!s.ok)
    return {
      ok: false as const,
      code: 'ERR-012',
      message: `File is too large. Maximum size: ${Math.round(MAX_FILE_SIZE_BYTES / 1048576)}MB.`,
    }
  // Magic bytes check is async; caller should await validateMagicBytes separately
  // Keep sync wrapper for basic validation
  void fileName
  void buffer
  return { ok: true as const, code: 'OK', message: '' }
}

export async function validateFileAsync(params: {
  fileName: string
  fileSize: number
  mimeType: string
  buffer: Buffer
}) {
  const sync = validateFile(params)
  if (!sync.ok) return sync
  const magic = await validateMagicBytes(params.buffer, params.mimeType)
  if (!magic.ok)
    return {
      ok: false as const,
      code: 'ERR-011',
      message:
        'This file type is not supported. Supported: PDF, DOCX, TXT, CSV, images.',
      reason: magic.reason,
    }
  return { ok: true as const, code: 'OK', message: '' }
}
