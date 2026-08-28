export function generateTitle(firstUserMessage: string): string {
  const firstLine = firstUserMessage.split('\n')[0]?.trim() ?? ''
  if (!firstLine) return 'New Chat'
  if (firstLine.length <= 60) return firstLine
  return `${firstLine.slice(0, 60).trimEnd()}…`
}
