import { useSyncExternalStore } from 'react'

export const SKILL_PREFERENCE_KEY = 'zona-ai:selected-skill'

export const DEFAULT_SKILL_ID = 'none'

let currentSkillPreference = DEFAULT_SKILL_ID
let initialized = false
const listeners = new Set<() => void>()

function initPreference(): void {
  if (initialized || typeof window === 'undefined') return
  try {
    const saved = localStorage.getItem(SKILL_PREFERENCE_KEY)
    if (saved && typeof saved === 'string') {
      const trimmed = saved.trim()
      if (trimmed) {
        currentSkillPreference = trimmed
      }
    }
  } catch {}
  initialized = true
}

export function getSelectedSkillPreference(): string {
  initPreference()
  return currentSkillPreference
}

export function setSelectedSkillPreference(skillId: string): void {
  const normalized = skillId.trim() || DEFAULT_SKILL_ID
  currentSkillPreference = normalized
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(SKILL_PREFERENCE_KEY, normalized)
    } catch {}
  }
  listeners.forEach((listener) => {
    listener()
  })
}

export function subscribeSkillPreference(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function resetSkillPreferenceForTesting(): void {
  currentSkillPreference = DEFAULT_SKILL_ID
  initialized = false
  listeners.clear()
}

export function useSelectedSkill(): [string, (skillId: string) => void] {
  const skillId = useSyncExternalStore(
    subscribeSkillPreference,
    getSelectedSkillPreference,
    () => DEFAULT_SKILL_ID,
  )
  return [skillId, setSelectedSkillPreference]
}
