import { createFileRoute, Outlet } from '@tanstack/react-router'
import { AdminShell } from '../components/admin/AdminShell'
import { verifyAdminAccessFn } from '../server/functions/admin-auth'

export const Route = createFileRoute('/admin')({
  beforeLoad: async () => {
    return verifyAdminAccessFn()
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
