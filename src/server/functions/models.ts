/**
 * Client-safe server function RPC wrappers.
 * Core implementations live in src/server/core/ (server-only).
 */
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getModelsCore } from '../core/models'

export const getModels = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest() as Request
  return getModelsCore({ request })
})
