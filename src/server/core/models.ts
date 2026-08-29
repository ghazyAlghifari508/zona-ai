/**
 * Server-only model helpers.
 * NEVER import from client code.
 */
import { getAuthSession } from '../../lib/auth/session'
import { getAvailableModels } from '../../lib/models/registry'

export async function getModelsCore({ request }: { request: Request }) {
  await getAuthSession(request)
  return getAvailableModels()
}
