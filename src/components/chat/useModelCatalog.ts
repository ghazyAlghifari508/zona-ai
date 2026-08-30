import { useEffect, useState } from 'react'
import type { ModelCatalogEntry } from '@/lib/models/types'

export function useModelCatalog(): ModelCatalogEntry[] {
  const [catalog, setCatalog] = useState<ModelCatalogEntry[]>([])
  useEffect(() => {
    let active = true
    import('@/server/functions/models')
      .then(({ getModelCatalog }) => getModelCatalog())
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
    catalog.find((m) => m.id === 'auto') ??
    null
  )
}
