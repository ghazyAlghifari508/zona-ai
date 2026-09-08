/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db/index'
import { auditLogs, creditTransactions, users } from '../../src/lib/db/schema'
import { AppError } from '../../src/lib/utils/errors'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CreditWidget } from '../../src/components/layout/CreditWidget'
import {
  adjustUserCreditsCore,
  listUserCreditsCore,
  resetDevCreditsCore,
} from '../../src/server/core/credits'
import {
  adjustUserCreditsFn,
  adjustUserCreditsSchema,
  listUserCreditsFn,
  listUserCreditsSchema,
  resetDevCreditsFn,
} from '../../src/server/functions/credits'

describe('Admin Credit Management & Guards', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Schemas & Server Functions Exports', () => {
    it('should export all required functions and schemas', () => {
      expect(typeof resetDevCreditsCore).toBe('function')
      expect(typeof adjustUserCreditsCore).toBe('function')
      expect(typeof listUserCreditsCore).toBe('function')
      expect(typeof resetDevCreditsFn).toBe('function')
      expect(typeof adjustUserCreditsFn).toBe('function')
      expect(typeof listUserCreditsFn).toBe('function')
    })

    it('should validate adjustUserCreditsSchema correctly', () => {
      const validAdd = adjustUserCreditsSchema.safeParse({
        userId: 'u-1',
        amount: 50,
        mode: 'add',
        reason: 'Bonus credits',
      })
      expect(validAdd.success).toBe(true)

      const validDeduct = adjustUserCreditsSchema.safeParse({
        userId: 'u-1',
        amount: 20,
        mode: 'deduct',
      })
      expect(validDeduct.success).toBe(true)

      const validSet = adjustUserCreditsSchema.safeParse({
        userId: 'u-1',
        amount: 100,
        mode: 'set',
      })
      expect(validSet.success).toBe(true)

      const invalidMode = adjustUserCreditsSchema.safeParse({
        userId: 'u-1',
        amount: 50,
        mode: 'invalid_mode',
      })
      expect(invalidMode.success).toBe(false)

      const negativeAmount = adjustUserCreditsSchema.safeParse({
        userId: 'u-1',
        amount: -10,
        mode: 'add',
      })
      expect(negativeAmount.success).toBe(false)

      const missingUserId = adjustUserCreditsSchema.safeParse({
        amount: 10,
        mode: 'add',
      })
      expect(missingUserId.success).toBe(false)
    })

    it('should validate listUserCreditsSchema correctly', () => {
      const emptyParsed = listUserCreditsSchema.parse({})
      expect(emptyParsed.page).toBe(1)
      expect(emptyParsed.limit).toBe(20)

      const customParsed = listUserCreditsSchema.parse({
        search: 'john',
        page: 3,
        limit: 15,
      })
      expect(customParsed.search).toBe('john')
      expect(customParsed.page).toBe(3)
      expect(customParsed.limit).toBe(15)
    })
  })

  describe('resetDevCreditsCore', () => {
    it('should reject non-admin request with 403 ERR-003', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-user',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-user',
        },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'User 1',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: false,
        },
      })

      const request = new Request('http://localhost:3000/api/credits/reset', {
        method: 'POST',
      })

      try {
        await resetDevCreditsCore({ request })
        expect.fail('Should have thrown 403 AppError')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-003')
      }
    })

    it('should allow admin request and reset caller credits to 100', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
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
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      vi.spyOn(db, 'execute').mockResolvedValueOnce({
        rows: [{ credits: 100 }],
      } as unknown as ReturnType<typeof db.execute>)

      let insertedTx: unknown
      let insertedAudit: unknown
      vi.spyOn(db, 'insert').mockImplementation((table) => {
        return {
          values: vi.fn().mockImplementation((val) => {
            if (table === creditTransactions) {
              insertedTx = val
            } else if (table === auditLogs) {
              insertedAudit = val
            }
            return Promise.resolve()
          }),
        } as unknown as ReturnType<typeof db.insert>
      })

      const request = new Request('http://localhost:3000/api/credits/reset', {
        method: 'POST',
      })

      const result = await resetDevCreditsCore({ request })
      expect(result.success).toBe(true)
      expect(result.newBalance).toBe(100)

      expect(insertedAudit).toMatchObject({
        adminId: 'admin-1',
        adminEmail: 'admin@zona.ai',
        action: 'credit.reset',
        targetId: 'admin-1',
        targetType: 'user',
      })
    })

    it('should allow admin to reset target user credits', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
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
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      vi.spyOn(db, 'execute').mockResolvedValueOnce({
        rows: [{ credits: 100 }],
      } as unknown as ReturnType<typeof db.execute>)

      let insertedAudit: unknown
      vi.spyOn(db, 'insert').mockImplementation((table) => {
        return {
          values: vi.fn().mockImplementation((val) => {
            if (table === auditLogs) {
              insertedAudit = val
            }
            return Promise.resolve()
          }),
        } as unknown as ReturnType<typeof db.insert>
      })

      const request = new Request('http://localhost:3000/api/credits/reset', {
        method: 'POST',
      })

      const result = await resetDevCreditsCore({
        request,
        targetUserId: 'target-user-456',
      })
      expect(result.success).toBe(true)
      expect(result.newBalance).toBe(100)

      expect(insertedAudit).toMatchObject({
        adminId: 'admin-1',
        adminEmail: 'admin@zona.ai',
        action: 'credit.reset',
        targetId: 'target-user-456',
        targetType: 'user',
      })
    })
  })

  describe('adjustUserCreditsCore', () => {
    it('should reject non-admin request with 403 ERR-003', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-user',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-user',
        },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'User 1',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: false,
        },
      })

      const request = new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
      })

      try {
        await adjustUserCreditsCore({
          request,
          data: {
            userId: 'target-user',
            amount: 50,
            mode: 'add',
          },
        })
        expect.fail('Should have thrown 403 AppError')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-003')
      }
    })

    it('should throw 404 when target user does not exist', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
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
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      vi.spyOn(db, 'transaction').mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([]),
            }),
          }),
        }
        return cb(mockTx)
      })

      const request = new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
      })

      try {
        await adjustUserCreditsCore({
          request,
          data: {
            userId: 'non-existent',
            amount: 50,
            mode: 'add',
          },
        })
        expect.fail('Should have thrown 404 AppError')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(404)
        expect(err.code).toBe('ERR-003')
      }
    })

    it('should add credits, update user, and record credit transaction and audit log', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
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
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      let updatedValues: unknown
      let insertedTx: unknown
      let insertedAudit: unknown

      vi.spyOn(db, 'transaction').mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                { id: 'target-user', credits: 40 },
              ]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockImplementation((val) => {
              updatedValues = val
              return {
                where: vi.fn().mockResolvedValue([]),
              }
            }),
          }),
          insert: vi.fn().mockImplementation((table) => {
            return {
              values: vi.fn().mockImplementation((val) => {
                if (table === creditTransactions) {
                  insertedTx = val
                } else if (table === auditLogs) {
                  insertedAudit = val
                }
                return Promise.resolve()
              }),
            }
          }),
        }
        return cb(mockTx)
      })

      const request = new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
      })

      const result = await adjustUserCreditsCore({
        request,
        data: {
          userId: 'target-user',
          amount: 50,
          mode: 'add',
          reason: 'Compensate for outage',
        },
      })

      expect(result.success).toBe(true)
      expect(result.previousBalance).toBe(40)
      expect(result.newBalance).toBe(90)

      expect(updatedValues).toMatchObject({
        credits: 90,
      })

      expect(insertedTx).toMatchObject({
        userId: 'target-user',
        amount: 50,
        type: 'adjustment',
        balanceAfter: 90,
        description: 'Compensate for outage',
      })

      expect(insertedAudit).toMatchObject({
        adminId: 'admin-1',
        adminEmail: 'admin@zona.ai',
        action: 'credit.adjust',
        targetId: 'target-user',
        targetType: 'user',
        metadata: {
          mode: 'add',
          amount: 50,
          previousBalance: 40,
          newBalance: 90,
          reason: 'Compensate for outage',
        },
      })
    })

    it('should deduct credits clamped to zero when amount exceeds previous balance', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
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
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      let updatedValues: unknown
      let insertedTx: unknown

      vi.spyOn(db, 'transaction').mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                { id: 'target-user', credits: 15 },
              ]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockImplementation((val) => {
              updatedValues = val
              return {
                where: vi.fn().mockResolvedValue([]),
              }
            }),
          }),
          insert: vi.fn().mockImplementation((table) => {
            return {
              values: vi.fn().mockImplementation((val) => {
                if (table === creditTransactions) {
                  insertedTx = val
                }
                return Promise.resolve()
              }),
            }
          }),
        }
        return cb(mockTx)
      })

      const request = new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
      })

      const result = await adjustUserCreditsCore({
        request,
        data: {
          userId: 'target-user',
          amount: 50,
          mode: 'deduct',
        },
      })

      expect(result.success).toBe(true)
      expect(result.previousBalance).toBe(15)
      expect(result.newBalance).toBe(0)

      expect(updatedValues).toMatchObject({
        credits: 0,
      })

      expect(insertedTx).toMatchObject({
        userId: 'target-user',
        amount: -15,
        type: 'adjustment',
        balanceAfter: 0,
      })
    })

    it('should set exact credits with mode set', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
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
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      let updatedValues: unknown
      let insertedTx: unknown

      vi.spyOn(db, 'transaction').mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
        const mockTx = {
          select: vi.fn().mockReturnValue({
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([
                { id: 'target-user', credits: 20 },
              ]),
            }),
          }),
          update: vi.fn().mockReturnValue({
            set: vi.fn().mockImplementation((val) => {
              updatedValues = val
              return {
                where: vi.fn().mockResolvedValue([]),
              }
            }),
          }),
          insert: vi.fn().mockImplementation((table) => {
            return {
              values: vi.fn().mockImplementation((val) => {
                if (table === creditTransactions) {
                  insertedTx = val
                }
                return Promise.resolve()
              }),
            }
          }),
        }
        return cb(mockTx)
      })

      const request = new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
      })

      const result = await adjustUserCreditsCore({
        request,
        data: {
          userId: 'target-user',
          amount: 500,
          mode: 'set',
        },
      })

      expect(result.success).toBe(true)
      expect(result.previousBalance).toBe(20)
      expect(result.newBalance).toBe(500)

      expect(updatedValues).toMatchObject({
        credits: 500,
      })

      expect(insertedTx).toMatchObject({
        userId: 'target-user',
        amount: 480,
        type: 'adjustment',
        balanceAfter: 500,
      })
    })
  })

  describe('listUserCreditsCore', () => {
    it('should reject non-admin request with 403', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-user',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-user',
        },
        user: {
          id: 'user-1',
          email: 'user@example.com',
          name: 'User 1',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: false,
        },
      })

      const request = new Request('http://localhost:3000/api/admin/credits')
      await expect(listUserCreditsCore({ request })).rejects.toThrowError(AppError)
    })

    it('should return paginated user credit balances for admin', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
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
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      const mockUsers = [
        {
          id: 'u-1',
          name: 'Alice',
          email: 'alice@example.com',
          image: null,
          credits: 250,
          role: 'user',
          banned: false,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ]

      let selectCallCount = 0
      vi.spyOn(db, 'select').mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 1) {
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ total: 1 }]),
            }),
          } as unknown as ReturnType<typeof db.select>
        }
        return {
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(mockUsers),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>
      })

      const request = new Request('http://localhost:3000/api/admin/credits')
      const result = await listUserCreditsCore({
        request,
        search: 'alice',
        page: 1,
        limit: 10,
      })

      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(10)
      expect(result.users).toEqual(mockUsers)
    })
  })

  describe('CreditWidget UI Role Gating', () => {
    it('should NOT render Reset 100 Kredit button for regular user', () => {
      const html = renderToStaticMarkup(
        React.createElement(CreditWidget, {
          credits: 100,
          user: { role: 'user' },
        }),
      )
      expect(html).not.toContain('Reset 100 Kredit')
      expect(html).not.toContain('reset-credits-btn')
    })

    it('should NOT render Reset 100 Kredit button when user is null or undefined', () => {
      const htmlNull = renderToStaticMarkup(
        React.createElement(CreditWidget, {
          credits: 100,
          user: null,
        }),
      )
      expect(htmlNull).not.toContain('Reset 100 Kredit')
      expect(htmlNull).not.toContain('reset-credits-btn')

      const htmlUndefined = renderToStaticMarkup(
        React.createElement(CreditWidget, {
          credits: 100,
        }),
      )
      expect(htmlUndefined).not.toContain('Reset 100 Kredit')
      expect(htmlUndefined).not.toContain('reset-credits-btn')
    })

    it('should render Reset 100 Kredit button when user has admin role', () => {
      const html = renderToStaticMarkup(
        React.createElement(CreditWidget, {
          credits: 100,
          user: { role: 'admin' },
        }),
      )
      expect(html).toContain('Reset 100 Kredit')
      expect(html).toContain('reset-credits-btn')
    })
  })
})


