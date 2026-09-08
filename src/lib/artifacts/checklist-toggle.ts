const STORAGE_PREFIX = 'zona-ai:artifact-markdown:'
const ARTIFACT_CHECKLIST_PREFIX = 'zona-ai:artifact-checklist:'

export type ArtifactChecklistState = Record<string, boolean>

export function createChecklistItemId(text: string, occurrence = 0): string {
  const clean = text
    .toLowerCase()
    .replace(/^\s*[-*]?\s*\[[ xX]\]\s*/g, '')
    .replace(/\[[ xX]\]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return `task:${clean || 'item'}:${occurrence}`
}

export function getArtifactChecklistStorageKey(
  artifactId: string,
  versionId: string,
): string {
  return `${ARTIFACT_CHECKLIST_PREFIX}${artifactId}:${versionId}`
}

export function getStoredArtifactChecklist(
  artifactId: string,
  versionId: string,
): ArtifactChecklistState {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(
      getArtifactChecklistStorageKey(artifactId, versionId),
    )
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (parsed && typeof parsed === 'object') {
        const result: ArtifactChecklistState = {}
        for (const [key, val] of Object.entries(parsed)) {
          if (typeof val === 'boolean') result[key] = val
        }
        return result
      }
    }

    // Fallback migration: check if legacy markdown exists
    const legacyMarkdown = getStoredArtifactMarkdown(
      `${artifactId}:${versionId}`,
    )
    if (legacyMarkdown) {
      const migrated: ArtifactChecklistState = {}
      const occurrenceMap = new Map<string, number>()
      const taskRegex = /^\s*[-*]\s*\[([ xX])\]\s*(.+)$/gm
      let match = taskRegex.exec(legacyMarkdown)
      while (match !== null) {
        const isChecked = match[1]?.toLowerCase() === 'x'
        const text = match[2]?.trim() ?? ''
        const occ = occurrenceMap.get(text) ?? 0
        occurrenceMap.set(text, occ + 1)
        const id = createChecklistItemId(text, occ)
        migrated[id] = isChecked
        match = taskRegex.exec(legacyMarkdown)
      }
      if (Object.keys(migrated).length > 0) {
        setStoredArtifactChecklist(artifactId, versionId, migrated)
        return migrated
      }
    }
    return {}
  } catch {
    return {}
  }
}

export function setStoredArtifactChecklist(
  artifactId: string,
  versionId: string,
  state: ArtifactChecklistState,
): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(
      getArtifactChecklistStorageKey(artifactId, versionId),
      JSON.stringify(state),
    )
  } catch {}
}

export function toggleMarkdownTask(
  markdown: string,
  taskIndex: number,
  nextChecked?: boolean,
): string {
  let currentIndex = 0
  return markdown.replace(
    /^(\s*[-*]\s*\[)( |x|X)(\]\s*)/gm,
    (match, prefix, currentCheck, suffix) => {
      if (currentIndex === taskIndex) {
        currentIndex++
        const isCurrentChecked = currentCheck.toLowerCase() === 'x'
        const shouldBeChecked =
          nextChecked !== undefined ? nextChecked : !isCurrentChecked
        return `${prefix}${shouldBeChecked ? 'x' : ' '}${suffix}`
      }
      currentIndex++
      return match
    },
  )
}

export function getStoredArtifactMarkdown(versionKey: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return localStorage.getItem(`${STORAGE_PREFIX}${versionKey}`)
  } catch {
    return null
  }
}

export function setStoredArtifactMarkdown(
  versionKey: string,
  markdown: string,
): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${versionKey}`, markdown)
  } catch {}
}
