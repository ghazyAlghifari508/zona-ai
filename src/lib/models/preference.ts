import { useSyncExternalStore } from 'react'
import type { ModelCatalogEntry } from './types'

export const DEFAULT_MODEL_PREFERENCE_KEY = 'zona-ai:default-model'
export const MODEL_PREFERENCE_KEY = DEFAULT_MODEL_PREFERENCE_KEY

let currentModelPreference = 'auto'
let initialized = false
const listeners = new Set<() => void>()

function initPreference(): void {
  if (initialized || typeof window === 'undefined') return
  try {
    const saved =
      localStorage.getItem(DEFAULT_MODEL_PREFERENCE_KEY) ||
      localStorage.getItem('zona-ai:selected-model')
    if (saved && typeof saved === 'string') {
      const trimmed = saved.trim()
      if (trimmed) {
        currentModelPreference = trimmed
      }
    }
  } catch {}
  initialized = true
}

export function getDefaultModelPreference(): string {
  initPreference()
  return currentModelPreference
}

export function setDefaultModelPreference(modelId: string): void {
  const normalized = modelId.trim() || 'auto'
  currentModelPreference = normalized
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(DEFAULT_MODEL_PREFERENCE_KEY, normalized)
    } catch {}
  }
  listeners.forEach((listener) => {
    try {
      listener()
    } catch {}
  })
}

export function resetDefaultModelPreferenceForTesting(
  defaultValue = 'auto',
): void {
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

export function useDefaultModel(): [string, (modelId: string) => void] {
  const modelId = useSyncExternalStore(
    subscribe,
    getDefaultModelPreference,
    () => 'auto',
  )
  return [modelId, setDefaultModelPreference]
}

export const getSelectedModelPreference = getDefaultModelPreference
export const setSelectedModelPreference = setDefaultModelPreference
export const resetModelPreferenceForTesting =
  resetDefaultModelPreferenceForTesting
export const useSelectedModel = useDefaultModel

export function resolveModelFallback(
  catalog: ModelCatalogEntry[],
  currentModelId: string,
): string {
  if (!currentModelId || currentModelId === 'auto') return 'auto'
  if (catalog.length === 0) return currentModelId

  const valid = catalog.some(
    (entry) =>
      (entry.id === currentModelId ||
        entry.routerModelId === currentModelId ||
        entry.aliasIds?.includes(currentModelId)) &&
      entry.status !== 'retired' &&
      entry.isActive !== false,
  )
  return valid ? currentModelId : 'auto'
}
