/**
 * Compare Card Width Heuristics and Variants
 *
 * Compact: Old compare card width (~400px) for short/simple responses.
 * Expanded: Current wide compare card width (~650px) for long/complex responses.
 */

export const OLD_COMPARE_CARD_WIDTH = 400
export const CURRENT_WIDE_COMPARE_CARD_WIDTH = 650

export const COMPACT_CARD_CLASS = 'md:w-[400px] md:max-w-[400px]'
export const EXPANDED_CARD_CLASS = 'md:w-[650px] md:max-w-[650px]'

export type CompareCardWidthVariant = 'compact' | 'expanded'

/**
 * Strips basic markdown syntax to measure actual visible/plain text characters.
 */
export function extractPlainContent(text: string): string {
  return text
    .replace(/^#+\s+/gm, '') // headings
    .replace(/\*\*(.*?)\*\*/g, '$1') // bold
    .replace(/\*(.*?)\*/g, '$1') // italic
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/~~(.*?)~~/g, '$1') // strikethrough
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^>\s+/gm, '') // blockquotes
    .replace(/^[-*+]\s+/gm, '') // unordered list bullets
    .replace(/^\d+\.\s+/gm, '') // ordered list numbers
    .trim()
}

/**
 * Determines whether a model response requires the expanded width variant.
 *
 * Returns `true` (expanded) if:
 * 1. Contains a fenced code block (```)
 * 2. Contains a markdown table structure
 * 3. Has normalized visible plain text >= 260 characters
 * 4. Has >= 6 substantive lines of text
 *
 * Otherwise returns `false` (compact, ~400px).
 */
export function shouldExpandCompareCard(
  content: string | null | undefined,
): boolean {
  if (!content) return false

  const raw = content.trim()
  if (raw.length === 0) return false

  // Code blocks and tables immediately benefit from expanded horizontal space
  if (raw.includes('```')) return true
  if (/\|.+?\|.+?\|/.test(raw)) return true

  const plain = extractPlainContent(raw)
  if (plain.length >= 180) return true

  const substantiveLines = plain
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (substantiveLines.length >= 5) return true

  return false
}
