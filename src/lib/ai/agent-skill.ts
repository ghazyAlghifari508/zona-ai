import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { z } from 'zod'

export const SKILL_MIME_TYPE = 'text/markdown'
export const SKILL_MIN_BODY_CHARS = 600
export const SKILL_MIN_SECTIONS = 3
export const SKILL_MIN_SECTION_CHARS = 40
export const SKILL_MAX_BYTES = 64 * 1024
export const SKILL_MAX_SLUG = 64
export const SKILL_MAX_DESCRIPTION = 500
export const ARTIFACT_HISTORY_BUDGET_BYTES = 64 * 1024

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const H1_RE = /^#[ \t].*$/gm
const H2_RE = /^##[ \t](.*)$/gm
const SLUG_KEY_RE = /^[a-z0-9-]+$/
const FENCE_LINE_RE = /^[ \t]*```.*$/
const FENCE_DELIM_RE = /^[ \t]*```\s*$/
const YAML_KEY_RE = /^(?:name|description|license)\s*:/i

export type ValidatedSkillDocument = {
  name: string
  displayName: string
  description: string
  license?: string
  extensions: Record<string, unknown>
  headings: string[]
  summary: string
  markdown: string
  fileName: string
  fileSize: number
}

export type SkillValidationResult =
  | { valid: true; document: ValidatedSkillDocument }
  | { valid: false; issues: string[] }

export function slugifySkillName(raw: string): string {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SKILL_MAX_SLUG)
}

export function normalizeSkillMarkdown(raw: string): string {
  let text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const trimmed = text.trim()
  if (trimmed.startsWith('```')) text = unwrapLeadingCodeFence(trimmed)
  const lines = text.split('\n').map((line) => line.replace(/[ \t]+$/g, ''))
  return `${lines.join('\n').trim()}\n`
}

function lastBareFenceIndex(lines: string[]): number | null {
  for (let i = lines.length - 1; i > 0; i--) {
    if (FENCE_DELIM_RE.test(lines[i])) return i
  }
  return null
}

function unwrapLeadingCodeFence(trimmed: string): string {
  const lines = trimmed.split('\n')
  const inner = lines.slice(1)
  const firstInnerLine = inner.find((line) => line.trim().length > 0) ?? ''
  if (firstInnerLine.trimStart().startsWith('---')) {
    const lastClose = lastBareFenceIndex(lines)
    if (lastClose !== null && lastClose > 0) {
      return lines.slice(1, lastClose).join('\n')
    }
    return inner.join('\n')
  }
  if (YAML_KEY_RE.test(firstInnerLine)) {
    const closeIdx = inner.findIndex((line) => FENCE_DELIM_RE.test(line))
    if (closeIdx !== -1) {
      const mapping = inner.slice(0, closeIdx)
      const rest = inner.slice(closeIdx + 1)
      return ['---', ...mapping, '---', '', ...rest].join('\n')
    }
  }
  return trimmed
}

function maskFencedCode(text: string): string {
  const lines = text.split('\n')
  const masked: string[] = []
  let insideFence = false
  for (const line of lines) {
    if (!insideFence && FENCE_LINE_RE.test(line)) {
      insideFence = true
      masked.push(line.replace(/\S/g, ' '))
      continue
    }
    if (insideFence && FENCE_DELIM_RE.test(line)) {
      insideFence = false
      masked.push(line.replace(/\S/g, ' '))
      continue
    }
    masked.push(insideFence ? line.replace(/\S/g, ' ') : line)
  }
  return masked.join('\n')
}

const frontmatterValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(frontmatterValueSchema),
    z.record(z.string(), frontmatterValueSchema),
  ]),
)

const skillFrontmatterSchema = z
  .object({
    name: z.string().min(1).max(SKILL_MAX_SLUG),
    description: z.string().min(1).max(SKILL_MAX_DESCRIPTION),
    license: z.string().min(1).max(200).optional(),
  })
  .catchall(frontmatterValueSchema)

function isJsonCompatible(value: unknown): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  )
    return true
  if (Array.isArray(value)) return value.every(isJsonCompatible)
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).every(
      ([key, entry]) => SLUG_KEY_RE.test(key) && isJsonCompatible(entry),
    )
  }
  return false
}

function stripInlineMarkdown(heading: string): string {
  return heading
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]+/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
}

function sectionIsSubstantive(section: string): boolean {
  if (/```/.test(section)) return true
  if (/^\s*[-*+] /m.test(section)) return true
  return section.replace(/\s/g, '').length >= SKILL_MIN_SECTION_CHARS
}

export function validateSkillDocument(raw: string): SkillValidationResult {
  const issues: string[] = []
  if (!raw?.trim()) return { valid: false, issues: ['empty-output'] }

  const normalized = normalizeSkillMarkdown(raw)
  if (Buffer.byteLength(normalized, 'utf8') > SKILL_MAX_BYTES)
    return { valid: false, issues: ['oversized'] }

  const fenceMatch = /^---[ \t]*\r?\n/.test(normalized)
    ? FRONTMATTER_RE.exec(normalized)
    : null
  if (!fenceMatch) return { valid: false, issues: ['missing-frontmatter'] }

  let parsed: unknown
  try {
    parsed = parseYaml(fenceMatch[1], { maxAliasCount: 50 })
  } catch {
    return { valid: false, issues: ['invalid-yaml'] }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return { valid: false, issues: ['invalid-frontmatter'] }

  const frontmatter = skillFrontmatterSchema.safeParse(parsed)
  if (!frontmatter.success)
    return { valid: false, issues: ['invalid-frontmatter'] }

  const name = slugifySkillName(frontmatter.data.name)
  if (!name) return { valid: false, issues: ['invalid-slug'] }

  const rawKeys = Object.keys(parsed as Record<string, unknown>)
  const seen = new Set<string>()
  const extensions: Record<string, unknown> = {}
  for (const key of rawKeys) {
    if (['name', 'description', 'license'].includes(key)) continue
    if (!SLUG_KEY_RE.test(key)) {
      issues.push('invalid-extension-key')
      continue
    }
    const lowered = key.toLowerCase()
    if (
      seen.has(lowered) ||
      ['name', 'description', 'license'].includes(lowered)
    ) {
      issues.push('duplicate-extension-key')
      continue
    }
    seen.add(lowered)
    const value = (parsed as Record<string, unknown>)[key]
    if (!isJsonCompatible(value)) {
      issues.push('invalid-extension-value')
      continue
    }
    extensions[key] = value
  }
  if (issues.length > 0) return { valid: false, issues }

  const body = normalized.slice(fenceMatch[0].length)
  const maskedBody = maskFencedCode(body)
  const h1Matches = [...maskedBody.matchAll(H1_RE)]
  if (h1Matches.length !== 1)
    return {
      valid: false,
      issues: [h1Matches.length === 0 ? 'missing-h1' : 'multiple-h1'],
    }

  const headingMatches = [...maskedBody.matchAll(H2_RE)]
  const headings: string[] = []
  for (let i = 0; i < headingMatches.length; i++) {
    const start = (headingMatches[i].index ?? 0) + headingMatches[i][0].length
    const end =
      i + 1 < headingMatches.length
        ? (headingMatches[i + 1].index ?? body.length)
        : body.length
    const title = stripInlineMarkdown(headingMatches[i][1] ?? '')
    if (title && sectionIsSubstantive(body.slice(start, end)))
      headings.push(title)
  }
  if (headings.length < SKILL_MIN_SECTIONS)
    return { valid: false, issues: ['too-few-sections'] }

  const bodyChars = body.replace(/\s/g, '').length
  if (bodyChars < SKILL_MIN_BODY_CHARS)
    return { valid: false, issues: ['body-too-short'] }

  const displayName = stripInlineMarkdown(
    (h1Matches[0][0].replace(/^#[ \t]/, '') ?? '').trim(),
  )
  const canonicalFrontmatter = stringifyYaml({
    name,
    description: frontmatter.data.description,
    ...(frontmatter.data.license ? { license: frontmatter.data.license } : {}),
    ...extensions,
  })
  const markdown = `---\n${canonicalFrontmatter}---\n\n${body.trim()}\n`
  const fileSize = Buffer.byteLength(markdown, 'utf8')
  if (fileSize > SKILL_MAX_BYTES) return { valid: false, issues: ['oversized'] }

  const fileName = `${name}.md`
  const summaryHeadings = headings.slice(0, 5)
  const summary = [
    `Skill \`${displayName}\` selesai dibuat.`,
    '',
    `Tujuan: ${frontmatter.data.description}`,
    '',
    'Isinya mencakup:',
    ...summaryHeadings.map((heading) => `- ${heading}`),
  ].join('\n')

  return {
    valid: true,
    document: {
      name,
      displayName,
      description: frontmatter.data.description,
      ...(frontmatter.data.license
        ? { license: frontmatter.data.license }
        : {}),
      extensions,
      headings: summaryHeadings,
      summary,
      markdown,
      fileName,
      fileSize,
    },
  }
}

export function buildSkillSummary(document: ValidatedSkillDocument): string {
  return document.summary
}

export function buildSkillFilename(document: ValidatedSkillDocument): string {
  return document.fileName
}

export function buildAgentSkillSystemPrompt(): string {
  return [
    'You generate exactly one portable Markdown skill document for an AI coding agent.',
    'Return ONLY the Markdown document: no preamble, no explanation, no JSON wrapper, no trailing commentary.',
    'Start the response with a line containing exactly three hyphens (---) to open YAML frontmatter, then the metadata mapping, then another --- line. Never wrap the document or the frontmatter in backtick code fences.',
    'Match the language of the user request for the document body; frontmatter name stays an ASCII slug.',
    'Frontmatter must be a YAML mapping with required `name` (lowercase ASCII slug) and `description` (when to invoke this skill).',
    'Include `license` only when the user supplied or requested real license information. Never invent metadata.',
    'Use exactly one H1 title and at least three substantive H2 sections with real paragraphs, lists, or code.',
    'Code examples are allowed inside fenced code blocks; keep heading-level `#` lines outside of them.',
    'Adapt the structure to the domain instead of reusing a fixed template: testing skills center red-green-refactor and test boundaries; debugging skills center evidence and hypothesis testing; migration skills center compatibility, rollback, and sequencing; design skills center visual direction, critique, and anti-generic checks.',
    'Write concrete decision rules and instructions, not filler or generic best-practice slogans.',
    'Consider purpose, usage boundaries, principles, workflow, constraints, examples when useful, anti-patterns, and verification; combine or rename sections when the domain is clearer another way.',
    'A shallow brief is unacceptable: the body must be thorough enough to guide real work.',
  ].join('\n')
}
