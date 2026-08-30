import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getAuthSession, getOptionalAuthSession } from '../../lib/auth/session'

export const getCurrentSession = createServerFn({ method: 'GET' }).handler(() =>
  getAuthSession(getRequest() as Request),
)

export const getOptionalSession = createServerFn({ method: 'GET' }).handler(
  () => getOptionalAuthSession(getRequest() as Request),
)
