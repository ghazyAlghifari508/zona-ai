import { isRedirect, redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { requireAdminSession } from '../../lib/auth/admin-guard'

export async function verifyAdminAccessCore(request: Request) {
  try {
    const session = await requireAdminSession(request)
    return { user: session.user }
  } catch (error) {
    if (isRedirect(error)) {
      throw error
    }
    throw redirect({ to: '/auth/sign-in' })
  }
}

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
