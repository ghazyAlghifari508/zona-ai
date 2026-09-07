import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'
import {
  type ArtifactStreamEvent,
  encodeArtifactSseEvent,
  parseArtifactStreamEvent,
} from '../../src/lib/ai/artifact-stream'
import {
  detectCurrentSection,
  generatePrdFilename,
  PRD_MIME_TYPE,
  PRD_SECTION_MARKERS,
  sanitizeFilename,
  validatePrdContent,
} from '../../src/lib/ai/prd-artifact'

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
      const text =
        '## 1. Overview\ntext\n## 2. Requirements\nmore\n## 3. Core Features\nstuff'
      expect(detectCurrentSection(text)).toBe('features')
    })

    it('detects all 7 sections', () => {
      for (const { section } of PRD_SECTION_MARKERS) {
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
  const GEN_ID = '11111111-1111-4111-8111-111111111111'
  const MODEL_ID = 'model-internal'
  const ROUTER_MODEL_ID = 'router/model'

  describe('encodeArtifactSseEvent', () => {
    it('encodes status event as SSE data line', () => {
      const event: ArtifactStreamEvent = {
        type: 'artifact-status',
        generationId: GEN_ID,
        modelId: MODEL_ID,
        kind: 'prd',
        operation: 'create',
        phase: 'preparing',
      }
      const encoded = encodeArtifactSseEvent(event)
      expect(encoded).toBe(`data: ${JSON.stringify(event)}\n\n`)
    })

    it('encodes artifact event with all fields', () => {
      const event: ArtifactStreamEvent = {
        type: 'artifact-created',
        generationId: GEN_ID,
        modelId: MODEL_ID,
        kind: 'prd',
        operation: 'create',
        artifactId: GEN_ID,
        versionId: GEN_ID,
        title: 'Release plan',
        version: 1,
        messageId: GEN_ID,
        conversationId: GEN_ID,
        routerModelId: ROUTER_MODEL_ID,
        summary: 'PRD selesai dibuat.',
        artifact: {
          attachmentId: GEN_ID,
          fileName: 'PRD-Test.md',
          fileSize: 1024,
          mimeType: 'text/markdown',
        },
      }
      const encoded = encodeArtifactSseEvent(event)
      expect(encoded).toContain('"type":"artifact-created"')
      expect(encoded).toContain(`"attachmentId":"${GEN_ID}"`)
      expect(encoded).toMatch(/^data: /)
      expect(encoded).toMatch(/\n\n$/)
    })
  })

  describe('parseArtifactStreamEvent', () => {
    it('parses valid status event', () => {
      const raw = {
        type: 'artifact-status',
        generationId: GEN_ID,
        modelId: MODEL_ID,
        kind: 'prd',
        operation: 'create',
        phase: 'preparing',
      }
      const event = parseArtifactStreamEvent(raw)
      expect(event.type).toBe('artifact-status')
    })

    it('parses valid artifact event', () => {
      const raw = {
        type: 'artifact-created',
        generationId: GEN_ID,
        modelId: MODEL_ID,
        kind: 'prd',
        operation: 'create',
        artifactId: GEN_ID,
        versionId: GEN_ID,
        title: 'Release plan',
        version: 1,
        messageId: GEN_ID,
        conversationId: GEN_ID,
        routerModelId: ROUTER_MODEL_ID,
        summary: 'PRD selesai dibuat.',
        artifact: {
          attachmentId: GEN_ID,
          fileName: 'test.md',
          fileSize: 100,
          mimeType: 'text/markdown',
        },
      }
      const event = parseArtifactStreamEvent(raw)
      expect(event.type).toBe('artifact-created')
    })

    it('parses valid done event', () => {
      const raw = {
        type: 'artifact-done',
        generationId: GEN_ID,
        modelId: MODEL_ID,
        kind: 'prd',
        operation: 'create',
        status: 'completed',
        messageId: GEN_ID,
        conversationId: GEN_ID,
      }
      const event = parseArtifactStreamEvent(raw)
      expect(event.type).toBe('artifact-done')
    })

    it('throws for null input', () => {
      expect(() => parseArtifactStreamEvent(null)).toThrow(ZodError)
    })

    it('throws for invalid kind', () => {
      expect(() =>
        parseArtifactStreamEvent({
          type: 'artifact-status',
          generationId: GEN_ID,
          modelId: MODEL_ID,
          kind: 'unknown-kind',
          operation: 'create',
          phase: 'preparing',
        }),
      ).toThrow(ZodError)
    })

    it('throws for missing type', () => {
      expect(() =>
        parseArtifactStreamEvent({
          generationId: GEN_ID,
          modelId: MODEL_ID,
          kind: 'prd',
          operation: 'create',
          phase: 'preparing',
        }),
      ).toThrow(ZodError)
    })
  })
})
