/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db/index'
import { AppError } from '../../src/lib/utils/errors'
import { listAuditLogsCore } from '../../src/server/core/admin-audit'
import { getAdminDashboardMetricsCore } from '../../src/server/core/admin-dashboard'
import {
  listAuditLogsFn,
  listAuditLogsSchema,
} from '../../src/server/functions/admin-audit'
import { getAdminDashboardMetricsFn } from '../../src/server/functions/admin-dashboard'


function auditCountQuery(
  total: number,
  onWhere?: (condition: unknown) => unknown,
) {
  const where = vi.fn().mockImplementation(
    onWhere ?? (() => Promise.resolve([{ total }])),
  )
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({ where }),
        }),
      }),
    }),
  }
}

function auditItemsQuery(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(rows),
                }),
              }),
            }),
          }),
        }),
      }),
    }),
  }
}

function recentAuditQuery(rows: unknown[]) {
  return {
    leftJoin: vi.fn().mockReturnValue({
      leftJoin: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(rows),
          }),
        }),
      }),
    }),
  }
}
describe('Admin Dashboard Metrics & Audit Log Services', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Exports and Schema Validation', () => {
    it('should export all required core and server functions', () => {
      expect(typeof listAuditLogsCore).toBe('function')
      expect(typeof getAdminDashboardMetricsCore).toBe('function')
      expect(typeof listAuditLogsFn).toBe('function')
      expect(typeof getAdminDashboardMetricsFn).toBe('function')
    })

    it('should validate listAuditLogsSchema with defaults and custom parameters', () => {
      const defaults = listAuditLogsSchema.parse({})
      expect(defaults.page).toBe(1)
      expect(defaults.limit).toBe(20)
      expect(defaults.action).toBeUndefined()
      expect(defaults.adminId).toBeUndefined()

      const custom = listAuditLogsSchema.parse({
        action: 'user.ban',
        adminId: 'admin-123',
        targetType: 'user',
        targetId: 'user-456',
        page: 3,
        limit: 50,
      })
      expect(custom.action).toBe('user.ban')
      expect(custom.adminId).toBe('admin-123')
      expect(custom.targetType).toBe('user')
      expect(custom.targetId).toBe('user-456')
      expect(custom.page).toBe(3)
      expect(custom.limit).toBe(50)
    })

    it('should reject invalid pagination parameters in listAuditLogsSchema', () => {
      const invalidPage = listAuditLogsSchema.safeParse({ page: 0 })
      expect(invalidPage.success).toBe(false)

      const invalidLimit = listAuditLogsSchema.safeParse({ limit: 101 })
      expect(invalidLimit.success).toBe(false)
    })
  })

  describe('Authorization Guards', () => {
    const regularUserSession = {
      session: {
        id: 's-regular',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-reg',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-reg',
      },
      user: {
        id: 'user-reg',
        email: 'user@example.com',
        name: 'Regular User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user',
        banned: false,
      },
    }

    const bannedAdminSession = {
      session: {
        id: 's-banned-admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'admin-banned',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-banned',
      },
      user: {
        id: 'admin-banned',
        email: 'bannedadmin@zona.ai',
        name: 'Banned Admin',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'admin',
        banned: true,
        banReason: 'Account compromised',
      },
    }

    it('should reject listAuditLogsCore for non-admin callers with 403 ERR-003', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(regularUserSession)
      const request = new Request('http://localhost:3000/api/admin/audit-logs')

      try {
        await listAuditLogsCore({ request })
        expect.fail('Should have thrown AppError ERR-003')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-003')
      }
    })

    it('should reject listAuditLogsCore for banned callers with 403 ERR-USER-BANNED', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(bannedAdminSession)
      const request = new Request('http://localhost:3000/api/admin/audit-logs')

      try {
        await listAuditLogsCore({ request })
        expect.fail('Should have thrown AppError ERR-USER-BANNED')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-USER-BANNED')
      }
    })

    it('should reject getAdminDashboardMetricsCore for non-admin callers with 403 ERR-003', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(regularUserSession)
      const request = new Request('http://localhost:3000/api/admin/metrics')

      try {
        await getAdminDashboardMetricsCore({ request })
        expect.fail('Should have thrown AppError ERR-003')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-003')
      }
    })

    it('should reject getAdminDashboardMetricsCore for banned callers with 403 ERR-USER-BANNED', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(bannedAdminSession)
      const request = new Request('http://localhost:3000/api/admin/metrics')

      try {
        await getAdminDashboardMetricsCore({ request })
        expect.fail('Should have thrown AppError ERR-USER-BANNED')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-USER-BANNED')
      }
    })
  })

  describe('listAuditLogsCore', () => {
    const mockAdminSession = {
      session: {
        id: 's-admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'admin-1',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-admin',
      },
      user: {
        id: 'admin-1',
        email: 'admin@zona.ai',
        name: 'Master Admin',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'admin',
        banned: false,
      },
    }

    it('should return paginated audit logs with user details and calculate totalPages', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockAdminSession)

      const mockLogs = [
        {
          id: 'log-1',
          adminId: 'admin-1',
          adminEmail: 'admin@zona.ai',
          adminName: 'Master Admin',
          adminImage: 'https://example.com/avatar.png',
          action: 'user.ban',
          targetId: 'user-bad',
          targetType: 'user',
          currentTargetName: null,
          metadata: { reason: 'Violation' },
          createdAt: new Date('2026-09-09T06:00:00.000Z'),
        },
        {
          id: 'log-2',
          adminId: 'admin-1',
          adminEmail: 'admin@zona.ai',
          adminName: 'Master Admin',
          adminImage: 'https://example.com/avatar.png',
          action: 'model.disable',
          targetId: 'cx/gpt-5.6-terra',
          targetType: 'model',
          currentTargetName: null,
          metadata: { disabledReason: 'Maintenance' },
          createdAt: new Date('2026-09-09T05:00:00.000Z'),
        },
      ]

      let selectCallCount = 0
      vi.spyOn(db, 'select').mockImplementation(() => {
        selectCallCount++
        return (
          selectCallCount === 1
            ? auditCountQuery(25)
            : auditItemsQuery(mockLogs)
        ) as unknown as ReturnType<typeof db.select>
      })

      const request = new Request('http://localhost:3000/api/admin/audit-logs')
      const result = await listAuditLogsCore({
        request,
        page: 2,
        limit: 10,
      })

      expect(result.items).toEqual(
        mockLogs.map((log) => ({ ...log, metadataUnreadable: false })),
      )
      expect(result.pagination).toEqual({
        total: 25,
        page: 2,
        limit: 10,
        totalPages: 3,
      })
    })

    it('should apply action and adminId filters when provided', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockAdminSession)

      let capturedWhereConditions: unknown
      let selectCallCount = 0
      vi.spyOn(db, 'select').mockImplementation(() => {
        selectCallCount++
        return (
          selectCallCount === 1
            ? auditCountQuery(1, (condition) => {
                capturedWhereConditions = condition
                return Promise.resolve([{ total: 1 }])
              })
            : auditItemsQuery([])
        ) as unknown as ReturnType<typeof db.select>
      })

      const request = new Request('http://localhost:3000/api/admin/audit-logs')
      const result = await listAuditLogsCore({
        request,
        action: 'credit.adjust',
        adminId: 'admin-1',
        page: 1,
        limit: 20,
      })

      expect(result.pagination.total).toBe(1)
      expect(result.pagination.totalPages).toBe(1)
      expect(capturedWhereConditions).toBeDefined()
    })

    it('should return totalPages 0 when total items is 0', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockAdminSession)

      let selectCallCount = 0
      vi.spyOn(db, 'select').mockImplementation(() => {
        selectCallCount++
        return (
          selectCallCount === 1
            ? auditCountQuery(0)
            : auditItemsQuery([])
        ) as unknown as ReturnType<typeof db.select>
      })

      const request = new Request('http://localhost:3000/api/admin/audit-logs')
      const result = await listAuditLogsCore({ request })

      expect(result.items).toEqual([])
      expect(result.pagination).toEqual({
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      })
    })
  })

  describe('getAdminDashboardMetricsCore', () => {
    const mockAdminSession = {
      session: {
        id: 's-admin',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'admin-1',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-admin',
      },
      user: {
        id: 'admin-1',
        email: 'admin@zona.ai',
        name: 'Master Admin',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'admin',
        banned: false,
      },
    }

    it('should aggregate metrics accurately and return 10 recent audit logs', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockAdminSession)

      const mockRecentLogs = [
        {
          id: 'log-recent-1',
          adminId: 'admin-1',
          adminEmail: 'admin@zona.ai',
          adminName: 'Master Admin',
          adminImage: null,
          action: 'user.ban',
          targetId: 'user-xyz',
          targetType: 'user',
          currentTargetName: null,
          metadata: null,
          metadataUnreadable: false,
          createdAt: new Date('2026-09-09T06:30:00.000Z'),
        },
      ]

      let callIndex = 0
      vi.spyOn(db, 'select').mockImplementation(() => {
        callIndex++
        const currentCall = callIndex

        return {
          from: vi.fn().mockImplementation(() => {
            if (currentCall === 1) {
              // totalUsers
              return Promise.resolve([{ value: 100 }])
            }
            if (currentCall === 2) {
              // activeUsers
              return {
                where: vi.fn().mockResolvedValue([{ value: 92 }]),
              }
            }
            if (currentCall === 3) {
              // bannedUsers
              return {
                where: vi.fn().mockResolvedValue([{ value: 8 }]),
              }
            }
            if (currentCall === 4) {
              // newFeedback
              return {
                where: vi.fn().mockResolvedValue([{ value: 5 }]),
              }
            }
            if (currentCall === 5) {
              // disabledModels
              return {
                where: vi.fn().mockResolvedValue([{ value: 2 }]),
              }
            }
            if (currentCall === 6) {
              // totalCreditsInCirculation
              return Promise.resolve([{ total: 12500 }])
            }
            if (currentCall === 7) {
              // totalCreditTransactions
              return Promise.resolve([{ value: 340 }])
            }
            if (currentCall === 8) {
              // recentAuditLogs
              return recentAuditQuery(mockRecentLogs)
            }
            // chartTransactions
            return {
              where: vi.fn().mockResolvedValue([
                {
                  createdAt: new Date('2026-09-08T12:00:00Z'),
                  amount: 15,
                  type: 'deduct',
                },
              ]),
            }
          }),
        } as unknown as ReturnType<typeof db.select>
      })

      const request = new Request('http://localhost:3000/api/admin/metrics')
      const metrics = await getAdminDashboardMetricsCore({ request })

      expect(metrics.totalUsers).toBe(100)
      expect(metrics.activeUsers).toBe(92)
      expect(metrics.bannedUsers).toBe(8)
      expect(metrics.newFeedbackCount).toBe(5)
      expect(metrics.disabledModelsCount).toBe(2)
      expect(metrics.totalCreditsInCirculation).toBe(12500)
      expect(metrics.totalCreditTransactions).toBe(340)
      expect(metrics.recentAuditLogs).toEqual(mockRecentLogs)
      expect(metrics.chartData).toBeDefined()
      expect(metrics.chartData.length).toBe(30)
    })

    it('should handle zero and null aggregates safely', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockAdminSession)

      let callIndex = 0
      vi.spyOn(db, 'select').mockImplementation(() => {
        callIndex++
        const currentCall = callIndex

        return {
          from: vi.fn().mockImplementation(() => {
            if (currentCall === 1) {
              return Promise.resolve([])
            }
            if (currentCall >= 2 && currentCall <= 5) {
              return {
                where: vi.fn().mockResolvedValue([]),
              }
            }
            if (currentCall === 6) {
              return Promise.resolve([{ total: null }])
            }
            if (currentCall === 7) {
              return Promise.resolve([])
            }
            if (currentCall === 8) {
              return recentAuditQuery([])
            }
            return {
              where: vi.fn().mockResolvedValue([]),
            }
          }),
        } as unknown as ReturnType<typeof db.select>
      })

      const request = new Request('http://localhost:3000/api/admin/metrics')
      const metrics = await getAdminDashboardMetricsCore({ request })

      expect(metrics.totalUsers).toBe(0)
      expect(metrics.activeUsers).toBe(0)
      expect(metrics.bannedUsers).toBe(0)
      expect(metrics.newFeedbackCount).toBe(0)
      expect(metrics.disabledModelsCount).toBe(0)
      expect(metrics.totalCreditsInCirculation).toBe(0)
      expect(metrics.totalCreditTransactions).toBe(0)
      expect(metrics.recentAuditLogs).toEqual([])
      expect(metrics.chartData).toBeDefined()
      expect(metrics.chartData.length).toBe(30)
    })

    it('should build 30 daily metric points correctly via buildDailyMetricPoints', async () => {
      const { buildDailyMetricPoints } = await import(
        '../../src/server/core/admin-dashboard'
      )
      const baseDate = new Date('2026-09-09T12:00:00Z')
      const mockTx = [
        {
          createdAt: new Date('2026-09-09T08:00:00Z'),
          amount: 10,
          type: 'deduct',
        },
        {
          createdAt: new Date('2026-09-09T10:00:00Z'),
          amount: 25,
          type: 'deduct',
        },
        {
          createdAt: new Date('2026-09-08T09:00:00Z'),
          amount: 5,
          type: 'deduct',
        },
      ]
      const points = buildDailyMetricPoints(mockTx, baseDate)
      expect(points.length).toBe(30)
      const todayPoint = points[points.length - 1]
      expect(todayPoint.creditsUsed).toBe(35)
      expect(todayPoint.transactionsCount).toBe(2)
      const yesterdayPoint = points[points.length - 2]
      expect(yesterdayPoint.creditsUsed).toBe(5)
      expect(yesterdayPoint.transactionsCount).toBe(1)
    })
  })
})
