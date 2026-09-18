import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { verifyAdminAccessCore } from '../core/admin-auth'

export const verifyAdminAccessFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const serverReq = getRequest()
    const request =
      serverReq ??
      (process.env.NODE_ENV === 'test'
        ? new Request('http://localhost:3000/admin')
        : null)
    if (!request) {
      throw new Error('Server request context unavailable')
    }
    return verifyAdminAccessCore(request)
  },
)
