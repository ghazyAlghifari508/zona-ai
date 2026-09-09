import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { verifyAdminAccessCore } from '../core/admin-auth'

export { verifyAdminAccessCore }

export const verifyAdminAccessFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    let request: Request
    try {
      const serverReq = getRequest()
      request = serverReq ?? new Request('http://localhost:3000/admin')
    } catch {
      request = new Request('http://localhost:3000/admin')
    }
    return verifyAdminAccessCore(request)
  },
)
