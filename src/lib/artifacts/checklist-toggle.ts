const STORAGE_PREFIX = 'zona-ai:artifact-markdown:'

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
