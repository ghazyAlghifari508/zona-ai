import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSelectedSkillPreference,
  resetSkillPreferenceForTesting,
  SKILL_PREFERENCE_KEY,
  setSelectedSkillPreference,
  subscribeSkillPreference,
} from '../../src/lib/chat/skill-preference'

describe('skill preference store', () => {
  beforeEach(() => {
    localStorage.clear()
    resetSkillPreferenceForTesting()
  })

  afterEach(() => {
    resetSkillPreferenceForTesting()
    vi.restoreAllMocks()
  })

  it('defaults to none', () => {
    expect(getSelectedSkillPreference()).toBe('none')
  })

  it('set then get returns the chosen skill', () => {
    setSelectedSkillPreference('checklist')
    expect(getSelectedSkillPreference()).toBe('checklist')
    setSelectedSkillPreference('prd-plan')
    expect(getSelectedSkillPreference()).toBe('prd-plan')
  })

  it('persists to localStorage and survives a fresh store init', () => {
    setSelectedSkillPreference('checklist')
    expect(localStorage.getItem(SKILL_PREFERENCE_KEY)).toBe('checklist')
    resetSkillPreferenceForTesting()
    expect(getSelectedSkillPreference()).toBe('checklist')
  })

  it('falls back to none for empty or whitespace-only values', () => {
    setSelectedSkillPreference('   ')
    expect(getSelectedSkillPreference()).toBe('none')
  })

  it('notifies subscribers on change', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSkillPreference(listener)
    setSelectedSkillPreference('checklist')
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    setSelectedSkillPreference('prd-plan')
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('ignores storage errors without breaking state', () => {
    const setItemSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded')
      })
    expect(() => setSelectedSkillPreference('checklist')).not.toThrow()
    expect(getSelectedSkillPreference()).toBe('checklist')
    setItemSpy.mockRestore()
  })

  it('reset clears store and re-reads storage on next access', () => {
    setSelectedSkillPreference('checklist')
    resetSkillPreferenceForTesting()
    expect(getSelectedSkillPreference()).toBe('checklist')
    localStorage.clear()
    resetSkillPreferenceForTesting()
    expect(getSelectedSkillPreference()).toBe('none')
  })
})
