import { z } from 'zod'

export type ChecklistItem = {
  id: string
  text: string
  completed: boolean
}

export type Checklist = {
  type: 'checklist'
  title?: string
  items: ChecklistItem[]
}

const MAX_ITEM_TEXT = 300
const MAX_ITEMS = 100
const LEGACY_MIN_ITEMS = 2
const MAX_TITLE_LENGTH = 80

const checklistPayloadSchema = z.object({
  type: z.literal('checklist'),
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
  items: z.array(z.unknown()).min(1).max(MAX_ITEMS),
})

const checklistItemSchema = z.object({
  id: z.string().trim().min(1).catch(''),
  text: z.string().min(1).catch(''),
  completed: z.boolean().catch(false),
})

const extractJsonCandidate = (content: string): string | null => {
  const trimmed = content.trim()
  if (trimmed.startsWith('{')) return trimmed
  const fenced = /```(?:json|JSON)?\s*\n([\s\S]*?)```/.exec(trimmed)
  return fenced ? fenced[1].trim() : null
}

export function parseChecklist(
  content: string | null | undefined,
): Checklist | null {
  if (!content) return null
  const candidate = extractJsonCandidate(content)
  if (!candidate) return null
  let raw: unknown
  try {
    raw = JSON.parse(candidate)
  } catch {
    return null
  }
  const parsed = checklistPayloadSchema.safeParse(raw)
  if (!parsed.success) return null

  const items: ChecklistItem[] = []
  for (const entry of parsed.data.items) {
    const item = checklistItemSchema.safeParse(entry)
    if (!item.success) continue
    const text = item.data.text.trim().slice(0, MAX_ITEM_TEXT)
    if (!text) continue
    items.push({
      id: item.data.id || `task-${items.length + 1}`,
      text,
      completed: item.data.completed,
    })
  }
  if (items.length === 0) return null

  return {
    type: 'checklist',
    ...(parsed.data.title ? { title: parsed.data.title } : {}),
    items,
  }
}

const LEGACY_TASK_LINE = /^\s*(?:[-*]\s+|\d+[.)]\s+)?\[( |x|X)\]\s*(.+?)\s*$/

export function parseLegacyChecklist(
  content: string | null | undefined,
): Checklist | null {
  if (!content) return null

  const items: ChecklistItem[] = []
  let title: string | undefined
  for (const line of content.split('\n')) {
    const match = LEGACY_TASK_LINE.exec(line)
    if (match) {
      const text = match[2].slice(0, MAX_ITEM_TEXT)
      if (!text) continue
      items.push({
        id: `task-${items.length + 1}`,
        text,
        completed: match[1].toLowerCase() === 'x',
      })
      continue
    }
    if (items.length === 0) {
      const candidate = line.trim()
      if (candidate && candidate.length <= MAX_TITLE_LENGTH) {
        title = candidate
      }
    }
  }
  if (items.length < LEGACY_MIN_ITEMS) return null

  return { type: 'checklist', ...(title ? { title } : {}), items }
}

export function resolveChecklist(
  content: string | null | undefined,
): Checklist | null {
  return parseChecklist(content) ?? parseLegacyChecklist(content)
}

export type ChecklistDisplay =
  | { status: 'ready'; checklist: Checklist }
  | { status: 'pending' }
  | null

export function resolveChecklistDisplay(
  content: string | null | undefined,
  isStreaming: boolean,
): ChecklistDisplay {
  const checklist = resolveChecklist(content)
  if (checklist) return { status: 'ready', checklist }
  if (isStreaming && isStreamingChecklistPayload(content)) {
    return { status: 'pending' }
  }
  return null
}

export function looksLikeChecklistPayload(
  content: string | null | undefined,
): boolean {
  if (!content) return false
  const trimmed = content.trimStart()
  return trimmed.startsWith('{') || trimmed.toLowerCase().startsWith('```json')
}

const PENDING_MIN_LENGTH = 2

export function isStreamingChecklistPayload(
  content: string | null | undefined,
): boolean {
  if (!content) return false
  const trimmed = content.trimStart()
  if (trimmed.length < PENDING_MIN_LENGTH) return false
  if (trimmed.startsWith('{')) {
    try {
      JSON.parse(trimmed)
      return false
    } catch {
      return true
    }
  }
  if (trimmed.toLowerCase().startsWith('```json')) {
    return trimmed.indexOf('```', 7) === -1
  }
  return false
}

export function getChecklistCopyText(checklist: Checklist): string {
  const lines = checklist.items.map(
    (item) => `- [${item.completed ? 'x' : ' '}] ${item.text}`,
  )
  return checklist.title
    ? [checklist.title, '', ...lines].join('\n')
    : lines.join('\n')
}
