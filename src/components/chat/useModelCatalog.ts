import { useQuery } from '@tanstack/react-query'
import type { ModelCatalogEntry } from '@/lib/models/types'

export const modelCatalogQueryKey = ['model-catalog'] as const
const CATALOG_STALE_TIME_MS = 30_000

export function loadModelCatalog(): Promise<ModelCatalogEntry[]> {
  return import('@/server/functions/models').then(({ getHistoricalCatalog }) =>
    getHistoricalCatalog(),
  )
}

export function useModelCatalog(): ModelCatalogEntry[] {
  const { data } = useQuery({
    queryKey: modelCatalogQueryKey,
    queryFn: loadModelCatalog,
    staleTime: CATALOG_STALE_TIME_MS,
    refetchOnWindowFocus: true,
  })
  return data ?? []
}

export function findCatalogEntry(
  catalog: ModelCatalogEntry[],
  modelId: string | null | undefined,
): ModelCatalogEntry | null {
  if (!modelId) return null
  const trimmed = modelId.trim()
  if (!trimmed) return null
  return (
    catalog.find(
      (entry) =>
        entry.id === trimmed ||
        entry.routerModelId === trimmed ||
        entry.aliasIds?.includes(trimmed),
    ) ?? null
  )
}
