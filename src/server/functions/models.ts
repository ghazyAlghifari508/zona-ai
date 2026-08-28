import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/start-server-core'
import { getAuthSession } from '../../lib/auth/session'
import { getAvailableModels } from '../../lib/models/registry'

export async function getModelsCore({ request }: { request: Request }) {
  await getAuthSession(request)
  return getAvailableModels()
}

export const getModels = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest() as Request
  return getModelsCore({ request })
})
