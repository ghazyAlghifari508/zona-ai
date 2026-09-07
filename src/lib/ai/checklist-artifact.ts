import { parseChecklist } from '../chat/checklist'
import {
  ARTIFACT_TITLE_MAX_LENGTH,
  MAX_ARTIFACT_VERSION_BYTES,
} from '../utils/constants'

export const CHECKLIST_MIME_TYPE = 'text/markdown' as const
export const CHECKLIST_MAX_BYTES = MAX_ARTIFACT_VERSION_BYTES

export type ChecklistArtifact = {
  markdown: string
  fileName: string
  fileSize: number
  summary: string
  title: string
  mimeType: typeof CHECKLIST_MIME_TYPE
}

export function sanitizeChecklistFilename(raw: string): string {
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
      .slice(0, 100) || ''
  )
}

export function generateChecklistFilename(title: string): string {
  const base = sanitizeChecklistFilename(title)
  if (!base) return ''
  return `Checklist-${base}.md`
}

function hasUnsafeTitleChars(raw: string): boolean {
  if (raw.includes('\r') || raw.includes('\n')) return true
  for (const ch of raw) {
    if (ch.charCodeAt(0) <= 0x1f) return true
  }
  return false
}

function normalizeTitle(raw: string | undefined): string | null {
  if (!raw) return null
  if (hasUnsafeTitleChars(raw)) return null
  const title = raw.replace(/\s+/g, ' ').trim()
  if (!title) return null
  return title.slice(0, ARTIFACT_TITLE_MAX_LENGTH)
}

export function validateChecklistArtifactContent(fullText: string): {
  valid: boolean
  issues: string[]
} {
  const built = buildChecklistArtifact(fullText)
  if (!built) {
    if (!fullText?.trim()) return { valid: false, issues: ['empty-output'] }
    if (Buffer.byteLength(fullText, 'utf8') > CHECKLIST_MAX_BYTES)
      return { valid: false, issues: ['oversized'] }
    const parsed = parseChecklist(fullText)
    if (!parsed) return { valid: false, issues: ['invalid-checklist'] }
    if (parsed.items.length === 0)
      return { valid: false, issues: ['empty-items'] }
    if (!normalizeTitle(parsed.title))
      return { valid: false, issues: ['missing-title'] }
    return { valid: false, issues: ['invalid-checklist'] }
  }
  return { valid: true, issues: [] }
}

export function buildChecklistArtifact(
  fullText: string,
): ChecklistArtifact | null {
  if (typeof fullText !== 'string') return null
  if (!fullText.trim()) return null
  if (Buffer.byteLength(fullText, 'utf8') > CHECKLIST_MAX_BYTES) return null

  const checklist = parseChecklist(fullText)
  if (!checklist || checklist.items.length === 0) return null

  const title = normalizeTitle(checklist.title)
  if (!title) return null

  const fileName = generateChecklistFilename(title)
  if (!fileName) return null

  const lines = checklist.items.map(
    (item) =>
      `- [${item.completed ? 'x' : ' '}] ${item.text.replace(/\s+/g, ' ').trim()}`,
  )
  const markdown = `# ${title}\n\n${lines.join('\n')}\n`
  if (markdown.includes('\r')) return null

  const fileSize = Buffer.byteLength(markdown, 'utf8')
  if (fileSize === 0 || fileSize > CHECKLIST_MAX_BYTES) return null

  const summary = `Checklist \`${title}\` selesai dibuat dengan ${checklist.items.length} tugas.`

  return {
    markdown,
    fileName,
    fileSize,
    summary,
    title,
    mimeType: CHECKLIST_MIME_TYPE,
  }
}
