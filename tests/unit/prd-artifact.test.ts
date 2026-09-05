import { describe, expect, it } from 'vitest'
import {
  detectCurrentSection,
  generatePrdFilename,
  sanitizeFilename,
  validatePrdContent,
  PRD_MIME_TYPE,
  PRD_SECTION_MARKERS,
} from '../../src/lib/ai/prd-artifact'
import {
  encodePrdSseEvent,
  parsePrdStreamEvent,
  type PrdStreamEvent,
} from '../../src/lib/ai/prd-stream'

describe('PRD artifact utilities', () => {
  describe('sanitizeFilename', () => {
    it('removes path traversal characters', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBe('etcpasswd')
    })

    it('removes invalid filesystem characters', () => {
      expect(sanitizeFilename('file<>:"/\\|?*.md')).toBe('file.md')
    })

    it('collapses multiple spaces into hyphens', () => {
      expect(sanitizeFilename('hello   world   test')).toBe('hello-world-test')
    })

    it('collapses multiple hyphens', () => {
      expect(sanitizeFilename('a---b---c')).toBe('a-b-c')
    })

    it('strips leading/trailing dots and hyphens', () => {
      expect(sanitizeFilename('..foo-')).toBe('foo')
    })

    it('truncates to 100 characters', () => {
      const long = 'a'.repeat(150)
      expect(sanitizeFilename(long).length).toBeLessThanOrEqual(100)
    })

    it('returns fallback for empty input', () => {
      expect(sanitizeFilename('')).toBe('PRD-Document')
    })

    it('removes control characters', () => {
      expect(sanitizeFilename('file\x00\x1fname')).toBe('filename')
    })
  })

  describe('generatePrdFilename', () => {
    it('generates filename from Indonesian PRD prompt', () => {
      const result = generatePrdFilename('buatkan PRD fitur login')
      expect(result).toBe('PRD-Fitur-Login.md')
    })

    it('handles "aplikasi" keyword', () => {
      const result = generatePrdFilename('buat aplikasi coffee shop')
      expect(result).toBe('PRD-Aplikasi-Coffee-Shop.md')
    })

    it('limits to 6 words', () => {
      const result = generatePrdFilename(
        'one two three four five six seven eight',
      )
      expect(result).toBe('PRD-One-Two-Three-Four-Five-Six.md')
    })

    it('falls back to Document for empty prompt', () => {
      const result = generatePrdFilename('buatkan prd')
      expect(result).toBe('PRD-Document.md')
    })

    it('capitalizes each word', () => {
      const result = generatePrdFilename('e-commerce mobile app')
      expect(result).toBe('PRD-E-commerce-Mobile-App.md')
    })

    it('always ends with .md', () => {
      const result = generatePrdFilename('anything')
      expect(result).toMatch(/\.md$/)
    })

    it('always starts with PRD-', () => {
      const result = generatePrdFilename('some feature')
      expect(result).toMatch(/^PRD-/)
    })
  })

  describe('validatePrdContent', () => {
    const validPrd = [
      '# PRD — Test Product',
      '',
      '## 1. Overview',
      'This product does something useful for users. It solves a real problem.',
      '',
      '## 2. Requirements',
      '- Auth required',
      '- Must be fast',
      '',
      '## 3. Core Features',
      '**Feature A:** Does something important.',
      '',
      '## 4. User Flow',
      '1. User opens app',
      '2. User does thing',
      '',
      '## 5. Architecture',
      'Frontend → Backend → DB',
      '',
      '## 6. Database Schema',
      'users, posts, comments tables',
      '',
      '## 7. Tech Stack',
      'React, Node.js, PostgreSQL',
    ].join('\n')

    it('accepts valid PRD with all sections', () => {
      const result = validatePrdContent(validPrd)
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('rejects empty content', () => {
      const result = validatePrdContent('')
      expect(result.valid).toBe(false)
      expect(result.issues).toContain('Content too short')
    })

    it('rejects content shorter than 100 characters', () => {
      const result = validatePrdContent('# PRD\n## 1. Overview\nShort.')
      expect(result.valid).toBe(false)
    })

    it('rejects content missing PRD heading', () => {
      const long = 'x'.repeat(200)
      const result = validatePrdContent(long)
      expect(result.valid).toBe(false)
      expect(result.issues).toContain('Missing PRD heading')
    })

    it('rejects content with fewer than 3 sections', () => {
      const partial = `# PRD — Test\n${'x'.repeat(200)}\n## 1. Overview\nSomething\n## 2. Requirements\nStuff`
      const result = validatePrdContent(partial)
      expect(result.valid).toBe(false)
      expect(result.issues.some((i) => i.includes('sections detected'))).toBe(
        true,
      )
    })
  })

  describe('detectCurrentSection', () => {
    it('returns null for text without section markers', () => {
      expect(detectCurrentSection('Hello world')).toBeNull()
    })

    it('detects overview section', () => {
      expect(detectCurrentSection('## 1. Overview\nSome text')).toBe('overview')
    })

    it('detects the last section in accumulated text', () => {
      const text = '## 1. Overview\ntext\n## 2. Requirements\nmore\n## 3. Core Features\nstuff'
      expect(detectCurrentSection(text)).toBe('features')
    })

    it('detects all 7 sections', () => {
      for (const { marker, section } of PRD_SECTION_MARKERS) {
        const match = marker.source.replace(/\\/g, '').replace('^', '').replace(/\(\?:.*\)/, '')
        const text = `## ${section === 'overview' ? '1' : section === 'requirements' ? '2' : section === 'features' ? '3' : section === 'userflow' ? '4' : section === 'architecture' ? '5' : section === 'schema' ? '6' : '7'}. Test`
        expect(detectCurrentSection(text)).toBe(section)
      }
    })
  })

  describe('PRD_MIME_TYPE', () => {
    it('is text/markdown', () => {
      expect(PRD_MIME_TYPE).toBe('text/markdown')
    })
  })
})

describe('PRD stream protocol', () => {
  describe('encodePrdSseEvent', () => {
    it('encodes status event as SSE data line', () => {
      const event: PrdStreamEvent = { type: 'prd-status', phase: 'preparing' }
      const encoded = encodePrdSseEvent(event)
      expect(encoded).toBe(
        `data: ${JSON.stringify(event)}\n\n`,
      )
    })

    it('encodes artifact event with all fields', () => {
      const event: PrdStreamEvent = {
        type: 'prd-artifact',
        attachmentId: '123',
        fileName: 'PRD-Test.md',
        fileSize: 1024,
        mimeType: 'text/markdown',
      }
      const encoded = encodePrdSseEvent(event)
      expect(encoded).toContain('"type":"prd-artifact"')
      expect(encoded).toContain('"attachmentId":"123"')
      expect(encoded).toMatch(/^data: /)
      expect(encoded).toMatch(/\n\n$/)
    })
  })

  describe('parsePrdStreamEvent', () => {
    it('parses valid status event', () => {
      const raw = { type: 'prd-status', phase: 'preparing' }
      const event = parsePrdStreamEvent(raw)
      expect(event.type).toBe('prd-status')
    })

    it('parses valid artifact event', () => {
      const raw = {
        type: 'prd-artifact',
        attachmentId: '123',
        fileName: 'test.md',
        fileSize: 100,
        mimeType: 'text/markdown',
      }
      const event = parsePrdStreamEvent(raw)
      expect(event.type).toBe('prd-artifact')
    })

    it('parses valid done event', () => {
      const raw = {
        type: 'prd-done',
        messageId: 'a',
        generationId: 'b',
        conversationId: 'c',
      }
      const event = parsePrdStreamEvent(raw)
      expect(event.type).toBe('prd-done')
    })

    it('throws for null input', () => {
      expect(() => parsePrdStreamEvent(null)).toThrow('not an object')
    })

    it('throws for invalid type', () => {
      expect(() =>
        parsePrdStreamEvent({ type: 'unknown-type' }),
      ).toThrow('invalid type')
    })

    it('throws for missing type', () => {
      expect(() => parsePrdStreamEvent({ phase: 'preparing' })).toThrow(
        'invalid type',
      )
    })
  })
})
