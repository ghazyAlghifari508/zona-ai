import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  getTheme,
  resetThemeForTesting,
  setTheme,
  subscribeTheme,
  THEME_STORAGE_KEY,
  THEMES,
  toggleTheme,
} from '../../src/lib/ui/theme'

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    document.documentElement.style.colorScheme = ''
    resetThemeForTesting()
  })

  afterEach(() => {
    resetThemeForTesting()
  })

  it('defaults to light and applies no dark class', () => {
    expect(getTheme()).toBe(DEFAULT_THEME)
    expect(getTheme()).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('persists the chosen theme to localStorage and applies the dark class', () => {
    setTheme('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.style.colorScheme).toBe('dark')

    setTheme('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('restores the persisted theme from localStorage on first read', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    resetThemeForTesting()
    expect(getTheme()).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('normalizes unknown stored values to light', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    resetThemeForTesting()
    expect(getTheme()).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('toggles between themes and returns the new value', () => {
    expect(toggleTheme()).toBe('dark')
    expect(getTheme()).toBe('dark')
    expect(toggleTheme()).toBe('light')
    expect(getTheme()).toBe('light')
  })

  it('notifies subscribers on change and supports unsubscribe', () => {
    const seen: string[] = []
    const unsubscribe = subscribeTheme(() => seen.push(getTheme()))
    setTheme('dark')
    unsubscribe()
    setTheme('light')
    expect(seen).toEqual(['dark'])
  })

  it('exposes exactly light and dark as valid themes', () => {
    expect(THEMES).toEqual(['light', 'dark'])
  })
})
