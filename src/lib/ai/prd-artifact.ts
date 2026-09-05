import type { PrdSection } from './prd-stream'

export const PRD_MIME_TYPE = 'text/markdown'

export const PRD_SECTION_MARKERS: ReadonlyArray<{
  marker: RegExp
  section: PrdSection
}> = [
  { marker: /^## 1\.\s/m, section: 'overview' },
  { marker: /^## 2\.\s/m, section: 'requirements' },
  { marker: /^## 3\.\s/m, section: 'features' },
  { marker: /^## 4\.\s/m, section: 'userflow' },
  { marker: /^## 5\.\s/m, section: 'architecture' },
  { marker: /^## 6\.\s/m, section: 'schema' },
  { marker: /^## 7\.\s/m, section: 'techstack' },
]

export function detectCurrentSection(text: string): PrdSection | null {
  let lastSection: PrdSection | null = null
  for (const { marker, section } of PRD_SECTION_MARKERS) {
    if (marker.test(text)) lastSection = section
  }
  return lastSection
}

export function sanitizeFilename(raw: string): string {
  const withoutUnsafe = Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0)
      if (code <= 0x1f) return false
      return !'<>:"/\\|?*'.includes(ch)
    })
    .join('')
  return (
    withoutUnsafe
      .replace(/\.{2,}/g, '.')
      .replace(/\s+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[-.]|[-.]$/g, '')
      .slice(0, 100) || 'PRD-Document'
  )
}

export function generatePrdFilename(userPrompt: string): string {
  const cleaned = userPrompt
    .replace(/buatkan\s+prd\s*/gi, '')
    .replace(/buat(kan)?\s*/gi, '')
    .replace(/untuk\s*/gi, '')
    .trim()

  const words = cleaned
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join('-')

  const base = sanitizeFilename(words || 'Document')
  return `PRD-${base}.md`
}

export function validatePrdContent(content: string): {
  valid: boolean
  issues: string[]
} {
  const issues: string[] = []
  if (!content || content.trim().length < 100) {
    issues.push('Content too short')
  }
  const hasHeading = /^#\s+PRD/m.test(content) || /^## 1\.\s/m.test(content)
  if (!hasHeading) {
    issues.push('Missing PRD heading')
  }
  let sectionCount = 0
  for (const { marker } of PRD_SECTION_MARKERS) {
    if (marker.test(content)) sectionCount++
  }
  if (sectionCount < 3) {
    issues.push(`Only ${sectionCount}/7 sections detected`)
  }
  return { valid: issues.length === 0, issues }
}
