import { describe, expect, it } from 'vitest'
import {
  canAddCompareModel,
  canSendCompareWith,
  getCompareSelectionHint,
  isCompareModelBlocked,
  isCompareSelectionValid,
  toggleCompareModel,
} from '../../src/lib/chat/compare-selection'
import {
  COMPARE_MAX_MODELS,
  COMPARE_MIN_MODELS,
} from '../../src/lib/utils/constants'

const MODELS = ['m1', 'm2', 'm3', 'm4', 'm5']

describe('compare-selection constraints', () => {
  it('single source of truth: min 2, max 4', () => {
    expect(COMPARE_MIN_MODELS).toBe(2)
    expect(COMPARE_MAX_MODELS).toBe(4)
  })

  it.each([
    [0, false],
    [1, false],
    [2, true],
    [3, true],
    [4, true],
    [5, false],
  ])('selection of %i models valid=%s', (count, valid) => {
    expect(isCompareSelectionValid(MODELS.slice(0, count))).toBe(valid)
  })

  it('adding is allowed below max and blocked at max', () => {
    for (let n = 0; n < COMPARE_MAX_MODELS; n += 1) {
      expect(canAddCompareModel(MODELS.slice(0, n))).toBe(true)
    }
    expect(canAddCompareModel(MODELS.slice(0, COMPARE_MAX_MODELS))).toBe(false)
  })

  it('rejects the 5th model and keeps the list unchanged', () => {
    const four = MODELS.slice(0, COMPARE_MAX_MODELS)
    const next = toggleCompareModel(four, MODELS[4])
    expect(next).toEqual(four)
    expect(next.length).toBe(COMPARE_MAX_MODELS)
  })

  it('unselecting from 4 to 3 stays valid', () => {
    const four = MODELS.slice(0, COMPARE_MAX_MODELS)
    const three = toggleCompareModel(four, four[0])
    expect(three.length).toBe(3)
    expect(three).not.toContain(four[0])
    expect(isCompareSelectionValid(three)).toBe(true)
  })

  it('unselecting from 2 to 1 becomes invalid', () => {
    const two = MODELS.slice(0, 2)
    const one = toggleCompareModel(two, two[1])
    expect(one.length).toBe(1)
    expect(isCompareSelectionValid(one)).toBe(false)
  })

  it('adding below max appends', () => {
    const two = MODELS.slice(0, 2)
    const three = toggleCompareModel(two, MODELS[2])
    expect(three).toEqual([...two, MODELS[2]])
    expect(isCompareSelectionValid(three)).toBe(true)
  })

  it('selected models stay unselectable; unselected are blocked only at max', () => {
    const four = MODELS.slice(0, COMPARE_MAX_MODELS)
    expect(isCompareModelBlocked(four, four[0])).toBe(false)
    expect(isCompareModelBlocked(four, MODELS[4])).toBe(true)
    const one = MODELS.slice(0, 1)
    expect(isCompareModelBlocked(one, MODELS[1])).toBe(false)
  })

  it('toggle never duplicates and never mutates the input', () => {
    const two = ['a', 'b']
    const snapshot = [...two]
    const afterRemove = toggleCompareModel(two, 'a')
    expect(afterRemove).toEqual(['b'])
    const afterAdd = toggleCompareModel(afterRemove, 'a')
    expect(afterAdd).toEqual(['b', 'a'])
    expect(afterAdd).toHaveLength(2)
    expect(two).toEqual(snapshot)
  })

  it('hint is null when valid and identical guidance below min', () => {
    expect(getCompareSelectionHint(MODELS.slice(0, 2))).toBeNull()
    expect(getCompareSelectionHint(MODELS.slice(0, 3))).toBeNull()
    expect(getCompareSelectionHint(MODELS.slice(0, 4))).toBeNull()
    const emptyHint = getCompareSelectionHint([])
    const oneHint = getCompareSelectionHint(MODELS.slice(0, 1))
    expect(emptyHint).not.toBeNull()
    expect(emptyHint).toBe(oneHint)
    expect(emptyHint).not.toContain('m1')
  })

  it('send gate requires valid selection plus content, credits, idle', () => {
    const gate = { hasContent: true, enoughCredits: true, idle: true }
    expect(canSendCompareWith(MODELS.slice(0, 1), gate)).toBe(false)
    expect(canSendCompareWith(MODELS.slice(0, 2), gate)).toBe(true)
    expect(canSendCompareWith(MODELS.slice(0, 4), gate)).toBe(true)
    expect(
      canSendCompareWith(MODELS.slice(0, 2), { ...gate, hasContent: false }),
    ).toBe(false)
    expect(
      canSendCompareWith(MODELS.slice(0, 2), { ...gate, enoughCredits: false }),
    ).toBe(false)
    expect(
      canSendCompareWith(MODELS.slice(0, 2), { ...gate, idle: false }),
    ).toBe(false)
  })
})
