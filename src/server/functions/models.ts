/**
 * Client-safe server function RPC wrappers.
 * Core implementations live in src/server/core/ (server-only).
 */

import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { catalogListQuerySchema } from '../../lib/models/catalog-contract'
import {
  getHistoricalCatalogCore,
  getModelCatalogCore,
  getModelsCore,
  listCatalogCore,
} from '../core/models'

export const getModels = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest() as Request
  return getModelsCore({ request })
})

export const getModelCatalog = createServerFn({ method: 'GET' }).handler(
  async () => getModelCatalogCore(),
)

export const getHistoricalCatalog = createServerFn({ method: 'GET' }).handler(
  async () => getHistoricalCatalogCore(),
)

export const listModelCatalog = createServerFn({ method: 'GET' })
  .validator(catalogListQuerySchema)
  .handler(async ({ data }) => listCatalogCore(data))
