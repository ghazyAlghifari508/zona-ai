/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db/index'
import { AppError } from '../../src/lib/utils/errors'
import {
  banUserCore,
  deleteUserCore,
  listUsersCore,
  unbanUserCore,
} from '../../src/server/core/admin-users'
import {
  banUserFn,
  banUserSchema,
  deleteUserFn,
  deleteUserSchema,
  listUsersFn,
  listUsersSchema,
  unbanUserFn,
  unbanUserSchema,
} from '../../src/server/functions/admin-users'
import {
  deleteAttachmentCore,
  reprocessAttachmentCore,
  uploadFileCore,
} from '../../src/server/functions/files'
import { searchWebCore } from '../../src/server/functions/search'

describe('Admin User Management & Ban Enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(db, 'transaction').mockImplementation(async (cb: unknown) => {
      return (cb as (tx: unknown) => Promise<unknown>)(db)
    })
  })

  describe('Exports and Server Functions', () => {
    it('should export core functions and server functions', () => {
      expect(typeof listUsersCore).toBe('function')
      expect(typeof banUserCore).toBe('function')
      expect(typeof unbanUserCore).toBe('function')
      expect(typeof deleteUserCore).toBe('function')
      expect(typeof listUsersFn).toBe('function')
      expect(typeof banUserFn).toBe('function')
      expect(typeof unbanUserFn).toBe('function')
      expect(typeof deleteUserFn).toBe('function')
    })

    it('should validate deleteUserSchema correctly', () => {
      expect(() => deleteUserSchema.parse({})).toThrow()
      expect(deleteUserSchema.parse({ userId: 'u-123' })).toEqual({
        userId: 'u-123',
      })
    })

    it('should validate listUsersSchema correctly', () => {
      const parsed = listUsersSchema.parse({})
      expect(parsed.page).toBe(1)
      expect(parsed.limit).toBe(20)

      const custom = listUsersSchema.parse({
        search: 'john',
        role: 'user',
        status: 'banned',
        page: 2,
        limit: 10,
      })
      expect(custom.search).toBe('john')
      expect(custom.role).toBe('user')
      expect(custom.status).toBe('banned')
      expect(custom.page).toBe(2)
      expect(custom.limit).toBe(10)
    })

    it('should validate banUserSchema and unbanUserSchema correctly', () => {
      const validBan = banUserSchema.safeParse({
        userId: 'u-123',
        reason: 'Violation of terms',
        expiresAt: '2026-12-31T23:59:59.000Z',
      })
      expect(validBan.success).toBe(true)

      const invalidBan = banUserSchema.safeParse({
        userId: '',
      })
      expect(invalidBan.success).toBe(false)

      const validUnban = unbanUserSchema.safeParse({
        userId: 'u-123',
      })
      expect(validUnban.success).toBe(true)

      const invalidUnban = unbanUserSchema.safeParse({
        userId: '',
      })
      expect(invalidUnban.success).toBe(false)
    })
  })

  describe('listUsersCore', () => {
    it('should reject non-admin request with 403', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-user',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-1',
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

      const request = new Request('http://localhost:3000/api/admin/users')
      await expect(listUsersCore({ request })).rejects.toThrowError(AppError)
    })

    it('should return paginated user list with total count for admin', async () => {
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
          emailVerified: true,
          image: null,
          credits: 100,
          role: 'user',
          banned: false,
          banReason: null,
          banExpires: null,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      ]

      let selectCallCount = 0
      vi.spyOn(db, 'select').mockImplementation(() => {
        selectCallCount++
        if (selectCallCount === 1) {
          // count query
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ total: 1 }]),
            }),
          } as unknown as ReturnType<typeof db.select>
        }
        // users query
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

      const request = new Request('http://localhost:3000/api/admin/users')
      const result = await listUsersCore({
        request,
        search: 'alice',
        role: 'user',
        status: 'active',
        page: 1,
        limit: 20,
      })

      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.users).toEqual(mockUsers)
    })
  })

  describe('banUserCore', () => {
    it('should reject non-admin request with 403', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-user',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-1',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-1',
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

      const request = new Request('http://localhost:3000/api/admin/users/ban')
      await expect(
        banUserCore({
          request,
          data: { userId: 'u-2', reason: 'Spam' },
        }),
      ).rejects.toThrowError(AppError)
    })

    it('should prevent admin from self-banning with 400 ERR-004', async () => {
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

      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'admin-1',
              email: 'admin@zona.ai',
              role: 'admin',
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>)

      const request = new Request('http://localhost:3000/api/admin/users/ban')
      try {
        await banUserCore({
          request,
          data: { userId: 'admin-1', reason: 'Testing self ban' },
        })
        expect.fail('Should have thrown ERR-004')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(400)
        expect(err.code).toBe('ERR-004')
      }
    })

    it('should prevent banning primary admin email alghifarighazy508@gmail.com with 400 ERR-004', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-admin-2',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'admin-2',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-admin-2',
        },
        user: {
          id: 'admin-2',
          email: 'admin2@zona.ai',
          name: 'Admin User 2',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'master-admin-id',
              email: 'alghifarighazy508@gmail.com',
              role: 'admin',
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>)

      const request = new Request('http://localhost:3000/api/admin/users/ban')
      try {
        await banUserCore({
          request,
          data: {
            userId: 'master-admin-id',
            reason: 'Testing master admin ban',
          },
        })
        expect.fail('Should have thrown ERR-004')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(400)
        expect(err.code).toBe('ERR-004')
      }
    })

    it('should ban user, update users record, and record audit log', async () => {
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

      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'bad-user',
              email: 'baduser@example.com',
              role: 'user',
              banned: false,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>)

      let updatedValues: unknown
      vi.spyOn(db, 'update').mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          updatedValues = val
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 'bad-user',
                  banned: true,
                  banReason: 'Malicious activity',
                  banExpires: new Date('2026-12-31T23:59:59.000Z'),
                },
              ]),
            }),
          }
        }),
      } as unknown as ReturnType<typeof db.update>)

      let auditEntry: unknown
      vi.spyOn(db, 'insert').mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          auditEntry = val
          return Promise.resolve()
        }),
      } as unknown as ReturnType<typeof db.insert>)

      const request = new Request('http://localhost:3000/api/admin/users/ban')
      const result = await banUserCore({
        request,
        data: {
          userId: 'bad-user',
          reason: 'Malicious activity',
          expiresAt: '2026-12-31T23:59:59.000Z',
        },
      })

      expect(result.success).toBe(true)
      expect(result.user.banned).toBe(true)
      expect(result.user.banReason).toBe('Malicious activity')

      expect(updatedValues).toMatchObject({
        banned: true,
        banReason: 'Malicious activity',
      })

      expect(auditEntry).toMatchObject({
        adminId: 'admin-1',
        adminEmail: 'admin@zona.ai',
        action: 'user.ban',
        targetId: 'bad-user',
        targetType: 'user',
        metadata: {
          reason: 'Malicious activity',
          expiresAt: '2026-12-31T23:59:59.000Z',
        },
      })
    })
  })

  describe('unbanUserCore', () => {
    it('should unban user, clear ban fields, and record audit log', async () => {
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

      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'reformed-user',
              email: 'reformed@example.com',
              role: 'user',
              banned: true,
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>)

      let updatedValues: unknown
      vi.spyOn(db, 'update').mockReturnValue({
        set: vi.fn().mockImplementation((val) => {
          updatedValues = val
          return {
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([
                {
                  id: 'reformed-user',
                  banned: false,
                  banReason: null,
                  banExpires: null,
                },
              ]),
            }),
          }
        }),
      } as unknown as ReturnType<typeof db.update>)

      let auditEntry: unknown
      vi.spyOn(db, 'insert').mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          auditEntry = val
          return Promise.resolve()
        }),
      } as unknown as ReturnType<typeof db.insert>)

      const request = new Request('http://localhost:3000/api/admin/users/unban')
      const result = await unbanUserCore({
        request,
        data: { userId: 'reformed-user' },
      })

      expect(result.success).toBe(true)
      expect(result.user.banned).toBe(false)
      expect(result.user.banReason).toBeNull()

      expect(updatedValues).toMatchObject({
        banned: false,
        banReason: null,
        banExpires: null,
      })

      expect(auditEntry).toMatchObject({
        adminId: 'admin-1',
        adminEmail: 'admin@zona.ai',
        action: 'user.unban',
        targetId: 'reformed-user',
        targetType: 'user',
        metadata: null,
      })
    })

    it('should prevent deleting admin self or primary admin with 400 ERR-004', async () => {
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

      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'admin-1',
              email: 'admin@zona.ai',
              role: 'admin',
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>)

      const request = new Request(
        'http://localhost:3000/api/admin/users/delete',
      )
      await expect(
        deleteUserCore({ request, data: { userId: 'admin-1' } }),
      ).rejects.toMatchObject({
        status: 400,
        code: 'ERR-004',
      })
    })

    it('should delete target user and record audit log', async () => {
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

      vi.spyOn(db, 'select').mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              id: 'test-user-to-delete',
              email: 'delete-me@example.com',
              name: 'Test User',
              role: 'user',
            },
          ]),
        }),
      } as unknown as ReturnType<typeof db.select>)

      const returningSpy = vi
        .fn()
        .mockResolvedValue([{ id: 'test-user-to-delete' }])
      const whereSpy = vi.fn().mockReturnValue({ returning: returningSpy })
      vi.spyOn(db, 'delete').mockReturnValue({
        where: whereSpy,
      } as unknown as ReturnType<typeof db.delete>)

      let auditEntry: unknown
      vi.spyOn(db, 'insert').mockReturnValue({
        values: vi.fn().mockImplementation((val) => {
          auditEntry = val
          return Promise.resolve()
        }),
      } as unknown as ReturnType<typeof db.insert>)

      const request = new Request(
        'http://localhost:3000/api/admin/users/delete',
      )
      const res = await deleteUserCore({
        request,
        data: { userId: 'test-user-to-delete' },
      })

      expect(res.success).toBe(true)
      expect(res.deletedUserId).toBe('test-user-to-delete')
      expect(whereSpy).toHaveBeenCalled()
      expect(auditEntry).toMatchObject({
        adminId: 'admin-1',
        action: 'user.delete',
        targetId: 'test-user-to-delete',
        targetType: 'user',
      })
    })
  })

  describe('API-wide Ban Enforcement on User-facing Functions', () => {
    const mockBannedSession = {
      session: {
        id: 's-banned',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'banned-user',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-banned',
      },
      user: {
        id: 'banned-user',
        email: 'banned@example.com',
        name: 'Banned User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user',
        banned: true,
        banReason: 'Tos violation',
      },
    }

    it('should reject uploadFileCore when user is banned with 403 ERR-USER-BANNED', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockBannedSession)
      const request = new Request('http://localhost:3000/api/files/upload', {
        method: 'POST',
      })

      try {
        await uploadFileCore({ request })
        expect.fail('Should have thrown ERR-USER-BANNED')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-USER-BANNED')
      }
    })

    it('should reject deleteAttachmentCore when user is banned with 403 ERR-USER-BANNED', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockBannedSession)
      const request = new Request('http://localhost:3000/api/files/delete', {
        method: 'POST',
      })

      try {
        await deleteAttachmentCore({
          data: { id: '00000000-0000-0000-0000-000000000001' },
          request,
        })
        expect.fail('Should have thrown ERR-USER-BANNED')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-USER-BANNED')
      }
    })

    it('should reject reprocessAttachmentCore when user is banned with 403 ERR-USER-BANNED', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockBannedSession)
      const request = new Request('http://localhost:3000/api/files/reprocess', {
        method: 'POST',
      })

      try {
        await reprocessAttachmentCore({
          data: { id: '00000000-0000-0000-0000-000000000001' },
          request,
        })
        expect.fail('Should have thrown ERR-USER-BANNED')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-USER-BANNED')
      }
    })

    it('should reject searchWebCore when user is banned with 403 ERR-USER-BANNED', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockBannedSession)
      const request = new Request('http://localhost:3000/api/search', {
        method: 'POST',
      })

      try {
        await searchWebCore({
          data: { query: 'test query', searchDepth: 'basic' },
          request,
        })
        expect.fail('Should have thrown ERR-USER-BANNED')
      } catch (e) {
        const err = e as AppError
        expect(err.status).toBe(403)
        expect(err.code).toBe('ERR-USER-BANNED')
      }
    })
  })
})
