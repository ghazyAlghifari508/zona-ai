import { useEffect, useState } from 'react'
import type { ModelCatalogEntry } from '@/lib/models/types'

let cachedCatalog: ModelCatalogEntry[] = []
let catalogRequest: Promise<ModelCatalogEntry[]> | null = null

function loadModelCatalog() {
  if (!catalogRequest) {
    catalogRequest = import('@/server/functions/models')
      .then(({ getModelCatalog }) => getModelCatalog())
      .then((entries) => {
        cachedCatalog = entries
        return entries
      })
      .catch((error: unknown) => {
        catalogRequest = null
        throw error
      })
  }
  return catalogRequest
}

export function useModelCatalog(): ModelCatalogEntry[] {
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>(cachedCatalog)
  useEffect(() => {
    let active = true
    loadModelCatalog()
      .then((entries) => {
        if (active) setCatalog(entries)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
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
