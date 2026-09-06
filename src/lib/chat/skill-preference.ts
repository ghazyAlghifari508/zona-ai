import { useSyncExternalStore } from 'react'
import { SKILL_IDS } from './skills'

export const DEFAULT_SKILL_PREFERENCE_KEY = 'zona-ai:default-skill'
export const SKILL_PREFERENCE_KEY = DEFAULT_SKILL_PREFERENCE_KEY

export const DEFAULT_SKILL_ID = 'none'

let currentSkillPreference = DEFAULT_SKILL_ID
let initialized = false
const listeners = new Set<() => void>()

function normalizeSkillId(raw: string): string {
  const trimmed = raw.trim()
  return (SKILL_IDS as readonly string[]).includes(trimmed)
    ? trimmed
    : DEFAULT_SKILL_ID
}

function initPreference(): void {
  if (initialized || typeof window === 'undefined') return
  try {
    const saved =
      localStorage.getItem(DEFAULT_SKILL_PREFERENCE_KEY) ||
      localStorage.getItem('zona-ai:selected-skill')
    if (saved && typeof saved === 'string') {
      currentSkillPreference = normalizeSkillId(saved)
    }
  } catch {}
  initialized = true
}

export function getDefaultSkillPreference(): string {
  initPreference()
  return currentSkillPreference
}

export function setDefaultSkillPreference(skillId: string): void {
  const normalized = normalizeSkillId(skillId) || DEFAULT_SKILL_ID
  currentSkillPreference = normalized
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(DEFAULT_SKILL_PREFERENCE_KEY, normalized)
    } catch {}
  }
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {}
  })
}

export function subscribeSkillPreference(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function resetDefaultSkillPreferenceForTesting(): void {
  currentSkillPreference = DEFAULT_SKILL_ID
  initialized = false
  listeners.clear()
}

export function useDefaultSkill(): [string, (skillId: string) => void] {
  const skillId = useSyncExternalStore(
    subscribeSkillPreference,
    getDefaultSkillPreference,
    () => DEFAULT_SKILL_ID,
  )
  return [skillId, setDefaultSkillPreference]
}

export const getSelectedSkillPreference = getDefaultSkillPreference
export const setSelectedSkillPreference = setDefaultSkillPreference
export const resetSkillPreferenceForTesting =
  resetDefaultSkillPreferenceForTesting
export const useSelectedSkill = useDefaultSkill
