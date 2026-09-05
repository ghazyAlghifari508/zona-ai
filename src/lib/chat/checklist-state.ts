const STORAGE_PREFIX = 'zona-ai:checklist:'

const overrides = new Map<string, Record<string, boolean>>()
let initialized = false

function initOverrides(): void {
  if (initialized || typeof window === 'undefined') return
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key?.startsWith(STORAGE_PREFIX)) continue
      const raw = localStorage.getItem(key)
      if (!raw) continue
      try {
        const parsed = JSON.parse(raw) as unknown
        if (!parsed || typeof parsed !== 'object') continue
        const record: Record<string, boolean> = {}
        for (const [itemId, value] of Object.entries(parsed)) {
          if (typeof value === 'boolean') record[itemId] = value
        }
        overrides.set(key.slice(STORAGE_PREFIX.length), record)
      } catch {}
    }
  } catch {}
  initialized = true
}

export function getCompletedOverrides(
  storageKey: string,
): Record<string, boolean> {
  initOverrides()
  return overrides.get(storageKey) ?? {}
}

export function setCompletedOverride(
  storageKey: string,
  itemId: string,
  completed: boolean,
): void {
  initOverrides()
  const current = overrides.get(storageKey) ?? {}
  const next = { ...current, [itemId]: completed }
  overrides.set(storageKey, next)
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(
        `${STORAGE_PREFIX}${storageKey}`,
        JSON.stringify(next),
      )
    } catch {}
  }
}

export function clearCompletedOverrides(): void {
  overrides.clear()
  initialized = true
  if (typeof window !== 'undefined') {
    try {
      const doomed: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(STORAGE_PREFIX)) doomed.push(key)
      }
      for (const key of doomed) localStorage.removeItem(key)
    } catch {}
  }
}
