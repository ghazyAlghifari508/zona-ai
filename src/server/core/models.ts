/**
 * Server-only model helpers.
 * NEVER import from client code.
 */
import { getAuthSession } from '../../lib/auth/session'
import { getAvailableModels, getModelCatalog } from '../../lib/models/registry'
import { getModelOverridesMap } from './admin-models'

export async function getModelsCore({ request }: { request: Request }) {
  await getAuthSession(request)
  return getAvailableModels()
}

export async function getModelCatalogCore() {
  const overrides = await getModelOverridesMap()
  return getModelCatalog(overrides)
}
