import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getAuthSession } from '../../lib/auth/session'

export const getCurrentSession = createServerFn({ method: 'GET' }).handler(() =>
  getAuthSession(getRequest() as Request),
)
