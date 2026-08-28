import { createServerFn } from '@tanstack/react-start'
import { getAuthSession } from '../../lib/auth/session'
import { getAvailableModels } from '../../lib/models/registry'

export const getModels = createServerFn({ method: 'GET' }).handler(async ({ request }) => {
  await getAuthSession(request as Request)
  return getAvailableModels()
})
