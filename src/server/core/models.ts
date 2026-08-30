/**
 * Server-only model helpers.
 * NEVER import from client code.
 */
import { getAuthSession } from '../../lib/auth/session'
import { getAvailableModels, getModelCatalog } from '../../lib/models/registry'

export async function getModelsCore({ request }: { request: Request }) {
  await getAuthSession(request)
  return getAvailableModels()
}

export async function getModelCatalogCore() {
  return getModelCatalog()
}
