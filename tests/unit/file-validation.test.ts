import { describe, expect, it } from 'vitest'
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../../src/lib/utils/constants'
import {
  sanitizeFilename,
  validateMagicBytes,
  validateMime,
  validateSize,
} from '../../src/lib/utils/file-validation'

describe('file-validation', () => {
  it('allowlist has pdf/docx/txt/csv/png/jpeg/webp', () => {
    expect(ALLOWED_MIME_TYPES).toContain('application/pdf')
    expect(ALLOWED_MIME_TYPES).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    expect(ALLOWED_MIME_TYPES).toContain('text/plain')
    expect(ALLOWED_MIME_TYPES).toContain('text/csv')
    expect(ALLOWED_MIME_TYPES).toContain('image/png')
    expect(ALLOWED_MIME_TYPES).toContain('image/jpeg')
    expect(ALLOWED_MIME_TYPES).toContain('image/webp')
  })
  it('sanitize strips traversal', () => {
    expect(sanitizeFilename('../evil.pdf')).toBe('evil.pdf')
    expect(sanitizeFilename('a/b/c.png')).toBe('c.png')
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd')
    expect(sanitizeFilename('my file@#$.pdf')).not.toContain('/')
  })
  it('validateSize rejects >MAX', () => {
    expect(validateSize(MAX_FILE_SIZE_BYTES + 1).ok).toBe(false)
    expect(validateSize(MAX_FILE_SIZE_BYTES - 1).ok).toBe(true)
    expect(validateSize(MAX_FILE_SIZE_BYTES).ok).toBe(true)
  })
  it('validateMime rejects exe', () => {
    expect(validateMime('application/x-msdownload').ok).toBe(false)
    expect(validateMime('application/pdf').ok).toBe(true)
  })
  it('validateMagicBytes rejects exe renamed pdf', async () => {
    const exeBuffer = Buffer.from([0x4d, 0x5a])
    const res = await validateMagicBytes(exeBuffer, 'application/pdf')
    expect(res.ok).toBe(false)
  })
  it('validateMagicBytes passes real pdf', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4')
    const res = await validateMagicBytes(pdfBuffer, 'application/pdf')
    expect(res.ok).toBe(true)
  })
})
