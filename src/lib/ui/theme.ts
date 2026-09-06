import { useSyncExternalStore } from 'react'

export const THEME_STORAGE_KEY = 'zona-ai:theme'
export const THEMES = ['light', 'dark'] as const
export type Theme = (typeof THEMES)[number]
export const DEFAULT_THEME: Theme = 'light'

let currentTheme: Theme = DEFAULT_THEME
let initialized = false
const listeners = new Set<() => void>()

function normalizeTheme(raw: unknown): Theme {
  return raw === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

function initTheme(): void {
  if (initialized || typeof window === 'undefined') return
  try {
    currentTheme = normalizeTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {}
  applyTheme(currentTheme)
  initialized = true
}

export function getTheme(): Theme {
  initTheme()
  return currentTheme
}

export function setTheme(theme: Theme): void {
  currentTheme = normalizeTheme(theme)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, currentTheme)
    } catch {}
  }
  applyTheme(currentTheme)
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {}
  })
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

export function subscribeTheme(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function resetThemeForTesting(): void {
  currentTheme = DEFAULT_THEME
  initialized = false
  listeners.clear()
}

export function useTheme(): [Theme, () => void] {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getTheme,
    () => DEFAULT_THEME,
  )
  return [theme, toggleTheme]
}
