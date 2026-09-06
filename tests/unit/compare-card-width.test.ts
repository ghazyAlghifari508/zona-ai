import { describe, expect, it } from 'vitest'
import {
  COMPARE_CONTAINER_CLASS,
  COMPARE_GRID_CLASS,
  COMPARE_MAX_WIDTH_CLASS,
  getCompareGridClasses,
} from '../../src/lib/chat/compare-card-width'

describe('compare grid layout constants & sizing', () => {
  it('defines stable wide max-width container (1480px)', () => {
    expect(COMPARE_MAX_WIDTH_CLASS).toBe('max-w-[1480px]')
    expect(COMPARE_CONTAINER_CLASS).toContain(COMPARE_MAX_WIDTH_CLASS)
    expect(COMPARE_CONTAINER_CLASS).toContain('mx-auto')
    expect(COMPARE_CONTAINER_CLASS).toContain('w-full')
  })

  it('defines stable 2-column responsive grid with items-stretch', () => {
    expect(COMPARE_GRID_CLASS).toContain('grid')
    expect(COMPARE_GRID_CLASS).toContain('grid-cols-1')
    expect(COMPARE_GRID_CLASS).toContain('md:grid-cols-2')
    expect(COMPARE_GRID_CLASS).toContain('items-stretch')
    expect(COMPARE_GRID_CLASS).toContain('gap-4')
  })

  it('returns consistent 2-column grid regardless of short response lengths', () => {
    const shortGenerations = [
      { id: 'g1', content: '42' },
      { id: 'g2', content: 'Jakarta' },
    ]
    const sizing = getCompareGridClasses(shortGenerations)
    expect(sizing.containerClass).toBe(COMPARE_CONTAINER_CLASS)
    expect(sizing.gridClass).toBe(COMPARE_GRID_CLASS)
    expect(sizing.gridClass).toContain('md:grid-cols-2')
  })

  it('returns identical grid classes regardless of long response lengths or asymmetric contents', () => {
    const mixedGenerations = [
      { id: 'g1', content: '42' },
      { id: 'g2', content: 'Long detailed explanation '.repeat(20) },
    ]
    const sizing = getCompareGridClasses(mixedGenerations)
    expect(sizing.containerClass).toBe(COMPARE_CONTAINER_CLASS)
    expect(sizing.gridClass).toBe(COMPARE_GRID_CLASS)
    expect(sizing.gridClass).toContain('md:grid-cols-2')
  })

  it('maintains stable 2-column grid for 3 models without asymmetric width distortion', () => {
    const threeGenerations = [
      { id: 'g1', content: 'Short' },
      { id: 'g2', content: '```typescript\nconst x = 1;\n```' },
      { id: 'g3', content: 'Another model output' },
    ]
    const sizing = getCompareGridClasses(threeGenerations)
    expect(sizing.containerClass).toBe(COMPARE_CONTAINER_CLASS)
    expect(sizing.gridClass).toBe(COMPARE_GRID_CLASS)
  })

  it('maintains stable 2-column grid for 4 models (2x2 grid)', () => {
    const fourGenerations = [
      { id: 'g1', content: 'A' },
      { id: 'g2', content: 'B' },
      { id: 'g3', content: 'C' },
      { id: 'g4', content: 'D' },
    ]
    const sizing = getCompareGridClasses(fourGenerations)
    expect(sizing.containerClass).toBe(COMPARE_CONTAINER_CLASS)
    expect(sizing.gridClass).toBe(COMPARE_GRID_CLASS)
  })

  it('handles empty or undefined generations cleanly', () => {
    const emptySizing = getCompareGridClasses([])
    expect(emptySizing.containerClass).toBe(COMPARE_CONTAINER_CLASS)
    expect(emptySizing.gridClass).toBe(COMPARE_GRID_CLASS)

    const undefSizing = getCompareGridClasses(undefined)
    expect(undefSizing.containerClass).toBe(COMPARE_CONTAINER_CLASS)
    expect(undefSizing.gridClass).toBe(COMPARE_GRID_CLASS)
  })
})
