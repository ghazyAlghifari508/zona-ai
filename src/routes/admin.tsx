import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AdminShell } from '../components/admin/AdminShell'
import { authClient } from '../lib/auth/auth-client'
import { verifyAdminAccessFn } from '../server/functions/admin-auth'

let cachedAdminAccess: Awaited<ReturnType<typeof verifyAdminAccessFn>> | null =
  null
let lastVerifiedTime = 0
const CACHE_TTL_MS = 60_000

export function invalidateAdminAccessCache() {
  cachedAdminAccess = null
  lastVerifiedTime = 0
}

export function getCachedAdminUser():
  | Awaited<ReturnType<typeof verifyAdminAccessFn>>['user']
  | null {
  return cachedAdminAccess?.user ?? null
}

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    const now = Date.now()
    const currentSession = await authClient.getSession().catch(() => null)
    const currentUserId = currentSession?.data?.user?.id
    if (
      typeof window !== 'undefined' &&
      cachedAdminAccess &&
      currentUserId &&
      cachedAdminAccess.user.id === currentUserId &&
      now - lastVerifiedTime < CACHE_TTL_MS
    ) {
      return cachedAdminAccess
    }
    const res = await verifyAdminAccessFn()
    if (typeof window !== 'undefined') {
      cachedAdminAccess = res
      lastVerifiedTime = Date.now()
    }
    return res
  },
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  )
}
