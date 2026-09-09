import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { getAdminDashboardMetricsCore } from '../core/admin-dashboard'

export const getAdminDashboardMetricsFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const request = getRequest()
  return getAdminDashboardMetricsCore({ request })
})
