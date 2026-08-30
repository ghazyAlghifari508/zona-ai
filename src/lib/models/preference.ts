import { useSyncExternalStore } from 'react'

export const MODEL_PREFERENCE_KEY = 'zona-ai:selected-model'

let currentModelPreference = 'auto'
let initialized = false
const listeners = new Set<() => void>()

function initPreference(): void {
  if (initialized || typeof window === 'undefined') return
  try {
    const saved = localStorage.getItem(MODEL_PREFERENCE_KEY)
    if (saved && typeof saved === 'string') {
      const trimmed = saved.trim()
      if (trimmed) {
        currentModelPreference = trimmed
      }
    }
  } catch {}
  initialized = true
}

export function getSelectedModelPreference(): string {
  initPreference()
  return currentModelPreference
}

export function setSelectedModelPreference(modelId: string): void {
  const normalized = modelId.trim() || 'auto'
  currentModelPreference = normalized
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(MODEL_PREFERENCE_KEY, normalized)
    } catch {}
  }
  listeners.forEach((listener) => {
    listener()
  })
}

export function resetModelPreferenceForTesting(defaultValue = 'auto'): void {
  currentModelPreference = defaultValue
  initialized = false
  listeners.clear()
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

export function useSelectedModel(): [string, (modelId: string) => void] {
  const modelId = useSyncExternalStore(
    subscribe,
    getSelectedModelPreference,
    () => 'auto',
  )
  return [modelId, setSelectedModelPreference]
}

export function resolveModelFallback(
  catalog: Array<{ id: string; enabled?: boolean }>,
  currentModelId: string,
): string {
  if (!currentModelId || currentModelId === 'auto') return 'auto'
  // If catalog is not loaded yet, do not fall back prematurely
  if (catalog.length === 0) return currentModelId

  const valid = catalog.some(
    (entry) => entry.id === currentModelId && entry.enabled !== false,
  )
  if (!valid) {
    setSelectedModelPreference('auto')
    return 'auto'
  }
  return currentModelId
}
