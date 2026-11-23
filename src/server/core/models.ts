/**
 * Server-only model helpers.
 * NEVER import from client code.
 */
import { getAuthSession } from '../../lib/auth/session'
import {
  type CatalogListPage,
  type CatalogListQuery,
  catalogListPageSchema,
  catalogListQuerySchema,
} from '../../lib/models/catalog-contract'
import type { CatalogDatabase } from './model-catalog'
import { getPublicCatalog } from './model-catalog'

export async function getModelsCore({ request }: { request: Request }) {
  await getAuthSession(request)
  return getPublicCatalog()
}

export async function getModelCatalogCore() {
  return getPublicCatalog()
}

export async function getHistoricalCatalogCore() {
  return getPublicCatalog(undefined, true)
}
export async function listCatalogCore(
  input: CatalogListQuery,
  database?: CatalogDatabase,
): Promise<CatalogListPage> {
  const query = catalogListQuerySchema.parse(input)
  const entries = await getPublicCatalog(
    database,
    query.includeRetired ?? false,
  )
  const offset = query.offset ?? 0
  const items = query.limit
    ? entries.slice(offset, offset + query.limit)
    : entries.slice(offset)
  return catalogListPageSchema.parse({
    items,
    nextOffset:
      query.limit && offset + query.limit < entries.length
        ? offset + query.limit
        : null,
  })
}
