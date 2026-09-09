import { useEffect, useState } from 'react'
import type { ModelCatalogEntry } from '@/lib/models/types'

let cachedCatalog: ModelCatalogEntry[] = []
let catalogRequest: Promise<ModelCatalogEntry[]> | null = null

export interface ModelSettingOverride {
  modelId: string
  isActive: boolean
  disabledReason?: string | null
}

export function mergeModelSettings(
  entries: ModelCatalogEntry[],
  settings?: ModelSettingOverride[] | null,
): ModelCatalogEntry[] {
  if (!settings || settings.length === 0) {
    return entries.map((entry) => ({
      ...entry,
      isActive: entry.isActive !== false,
      disabledReason: entry.disabledReason ?? null,
    }))
  }

  const settingsMap = new Map(settings.map((s) => [s.modelId, s]))

  return entries.map((entry) => {
    let override = settingsMap.get(entry.id)
    if (!override) {
      for (const [key, value] of settingsMap.entries()) {
        if (
          key === entry.id ||
          entry.id.endsWith(`/${key}`) ||
          key.endsWith(`/${entry.id}`)
        ) {
          override = value
          break
        }
      }
    }

    const isActive = override ? override.isActive : entry.isActive
    const disabledReason = override
      ? (override.disabledReason ?? null)
      : (entry.disabledReason ?? null)

    return {
      ...entry,
      isActive: isActive !== false,
      disabledReason,
    }
  })
}

export function clearModelCatalogCache(): void {
  cachedCatalog = []
  catalogRequest = null
}

export function loadModelCatalog(
  settingsFetcher?: () => Promise<ModelSettingOverride[] | null>,
): Promise<ModelCatalogEntry[]> {
  if (!catalogRequest) {
    catalogRequest = import('@/server/functions/models')
      .then(async ({ getModelCatalog }) => {
        const entries = await getModelCatalog()
        const settings = settingsFetcher
          ? await settingsFetcher().catch(() => null)
          : null
        const merged = mergeModelSettings(entries, settings)
        cachedCatalog = merged
        return merged
      })
      .catch((error: unknown) => {
        catalogRequest = null
        throw error
      })
  }
  return catalogRequest
}

export function useModelCatalog(
  settingsFetcher?: () => Promise<ModelSettingOverride[] | null>,
): ModelCatalogEntry[] {
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>(cachedCatalog)
  useEffect(() => {
    let active = true
    loadModelCatalog(settingsFetcher)
      .then((entries) => {
        if (active) setCatalog(entries)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [settingsFetcher])
  return catalog
}

export function findCatalogEntry(
  catalog: ModelCatalogEntry[],
  modelId: string | null | undefined,
): ModelCatalogEntry | null {
  if (!modelId) return null
  return (
    catalog.find((m) => m.id === modelId) ??
    catalog.find((m) => m.id.endsWith(`/${modelId}`)) ??
    catalog.find((m) => modelId.endsWith(`/${m.id}`)) ??
    catalog.find((m) => m.id === 'auto') ??
    null
  )
}
