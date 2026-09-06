/**
 * Compare Grid Layout Constants & Helpers
 *
 * Uses a stable 2-column grid on desktop (repeat(2, minmax(0, 1fr)))
 * and 1-column on mobile. Consistent width across all models.
 */

export const COMPARE_MAX_WIDTH_CLASS = 'max-w-[1440px]'
export const COMPARE_GUTTER_CLASS = 'px-4 sm:px-6 lg:px-6'
export const COMPARE_CONTAINER_CLASS = `mx-auto w-full ${COMPARE_MAX_WIDTH_CLASS}`
export const COMPARE_GRID_CLASS =
  'grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5 items-stretch'

export type CompareGridSizing = {
  containerClass: string
  gridClass: string
}

/**
 * Calculates responsive CSS Grid and container classes.
 * Guarantees that cards on desktop remain strictly a consistent 2-column grid:
 * - 2 models: 2 equal columns (50% each)
 * - 4 models: 2x2 grid of equal columns
 * - 3 models: 2 equal columns, 3rd card stays equal width without stretching
 */
export function getCompareGridClasses(
  _generations?: Array<{ id: string; content?: string | null }>,
  _expandedIds?: Set<string>,
): CompareGridSizing {
  return {
    containerClass: COMPARE_CONTAINER_CLASS,
    gridClass: COMPARE_GRID_CLASS,
  }
}
