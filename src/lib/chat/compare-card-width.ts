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

export type CompareGridSizing = {
  containerClass: string
  gridClass: string
}

/**
 * Calculates responsive CSS Grid and container classes based on model variants.
 * Guarantees that 2 models on desktop remain strictly horizontal / side-by-side:
 * - 2 compact: max-w-[860px] with md:grid-cols-2 (~400px each)
 * - 2 expanded: max-w-[1360px] with md:grid-cols-2 (50% each)
 * - 1 compact, 1 expanded: max-w-[1360px] with asymmetric 2-column grid
 */
export function getCompareGridClasses(
  generations: Array<{ id: string; content?: string | null }>,
  expandedIds: Set<string>,
): CompareGridSizing {
  if (generations.length === 2) {
    const is0 =
      expandedIds.has(generations[0].id) ||
      shouldExpandCompareCard(generations[0].content)
    const is1 =
      expandedIds.has(generations[1].id) ||
      shouldExpandCompareCard(generations[1].content)

    if (!is0 && !is1) {
      return {
        containerClass: 'mx-auto w-full max-w-[860px]',
        gridClass: 'grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5',
      }
    }

    if (is0 && is1) {
      return {
        containerClass: 'mx-auto w-full max-w-[1360px]',
        gridClass: 'grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5',
      }
    }

    if (!is0 && is1) {
      return {
        containerClass: 'mx-auto w-full max-w-[1360px]',
        gridClass:
          'grid grid-cols-1 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-4 md:gap-5',
      }
    }

    return {
      containerClass: 'mx-auto w-full max-w-[1360px]',
      gridClass:
        'grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,400px)] gap-4 md:gap-5',
    }
  }

  const hasAnyExpanded = generations.some(
    (g) => expandedIds.has(g.id) || shouldExpandCompareCard(g.content),
  )

  return {
    containerClass: hasAnyExpanded
      ? 'mx-auto w-full max-w-[1360px]'
      : 'mx-auto w-full max-w-[860px]',
    gridClass: 'grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5',
  }
}
