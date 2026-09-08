/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  checkUserNotBanned,
  preventAdminSelfBan,
  requireAdminSession,
} from '../../src/lib/auth/admin-guard'
import { auth } from '../../src/lib/auth/auth'
import { getAuthSession } from '../../src/lib/auth/session'
import { db } from '../../src/lib/db/index'
import { AppError } from '../../src/lib/utils/errors'

describe('Admin & Ban Guards', () => {
  it('should throw 403 ERR-USER-BANNED when user is banned', () => {
    expect(() =>
      checkUserNotBanned({ banned: true, banReason: 'Spam activity' }),
    ).toThrowError(AppError)

    try {
      checkUserNotBanned({ banned: true, banReason: 'Violation' })
    } catch (e) {
      const err = e as AppError
      expect(err.status).toBe(403)
      expect(err.code).toBe('ERR-USER-BANNED')
    }
  })

  it('should throw 403 ERR-USER-BANNED when user is banned without reason', () => {
    try {
      checkUserNotBanned({ banned: true })
    } catch (e) {
      const err = e as AppError
      expect(err.status).toBe(403)
      expect(err.code).toBe('ERR-USER-BANNED')
      expect(err.message).toBe('Akun Anda telah dinonaktifkan.')
    }
  })

  it('should pass when user is not banned', () => {
    expect(() => checkUserNotBanned({ banned: false })).not.toThrow()
    expect(() => checkUserNotBanned(null)).not.toThrow()
    expect(() => checkUserNotBanned(undefined)).not.toThrow()
  })

  it('should prevent admin from banning self or primary admin email', () => {
    expect(() =>
      preventAdminSelfBan('admin-1', 'admin-1', 'admin@zona.ai'),
    ).toThrowError('Admin utama tidak dapat menonaktifkan akun sendiri.')

    try {
      preventAdminSelfBan('admin-1', 'admin-1', 'admin@zona.ai')
    } catch (e) {
      const err = e as AppError
      expect(err.status).toBe(400)
      expect(err.code).toBe('ERR-004')
    }

    expect(() =>
      preventAdminSelfBan('admin-1', 'user-2', 'alghifarighazy508@gmail.com'),
    ).toThrowError('Admin utama tidak dapat menonaktifkan akun sendiri.')

    expect(() =>
      preventAdminSelfBan('admin-1', 'user-2', 'regular@example.com'),
    ).not.toThrow()
  })
})

describe('requireAdminSession', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw 401 ERR-002 when unauthenticated', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(null)
    const request = new Request('http://localhost:3000/api/admin')

    await expect(requireAdminSession(request)).rejects.toThrowError(AppError)

    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(null)
    try {
      await requireAdminSession(request)
    } catch (e) {
      const err = e as AppError
      expect(err.status).toBe(401)
      expect(err.code).toBe('ERR-002')
    }
  })

  it('should throw 403 ERR-USER-BANNED when admin user is banned', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
      session: {
        id: 'sess-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'admin-banned',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-1',
      },
      user: {
        id: 'admin-banned',
        email: 'banned-admin@example.com',
        name: 'Banned Admin',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'admin',
        banned: true,
        banReason: 'Account compromised',
      },
    })
    const request = new Request('http://localhost:3000/api/admin')

    try {
      await requireAdminSession(request)
    } catch (e) {
      const err = e as AppError
      expect(err.status).toBe(403)
      expect(err.code).toBe('ERR-USER-BANNED')
    }
  })

  it('should throw 403 ERR-003 when user is not admin', async () => {
    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
      session: {
        id: 'sess-2',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-regular',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-2',
      },
      user: {
        id: 'user-regular',
        email: 'regular@example.com',
        name: 'Regular User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user',
        banned: false,
      },
    })
    const request = new Request('http://localhost:3000/api/admin')

    try {
      await requireAdminSession(request)
    } catch (e) {
      const err = e as AppError
      expect(err.status).toBe(403)
      expect(err.code).toBe('ERR-003')
      expect(err.message).toBe(
        'Akses ditolak. Diperlukan hak akses administrator.',
      )
    }
  })

  it('should return session when user is an active admin', async () => {
    const mockSession = {
      session: {
        id: 'sess-3',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'admin-active',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-3',
      },
      user: {
        id: 'admin-active',
        email: 'active-admin@example.com',
        name: 'Active Admin',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'admin',
        banned: false,
      },
    }
    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(mockSession)
    const request = new Request('http://localhost:3000/api/admin')

    const result = await requireAdminSession(request)
    expect(result.user.id).toBe('admin-active')
    expect(result.user.role).toBe('admin')
  })
})

describe('getAuthSession admin bootstrap sync', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('should automatically upgrade role to admin if user email is in ADMIN_EMAILS', async () => {
    const updateSpy = vi.spyOn(db, 'update').mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue({}),
      }),
    } as unknown as ReturnType<typeof db.update>)

    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
      session: {
        id: 'sess-4',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-bootstrap',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-4',
      },
      user: {
        id: 'user-bootstrap',
        email: 'alghifarighazy508@gmail.com',
        name: 'Bootstrap Admin',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user',
        banned: false,
      },
    })
    const request = new Request('http://localhost:3000/api/me')

    const session = await getAuthSession(request)
    expect(session.user.role).toBe('admin')
    expect(updateSpy).toHaveBeenCalled()
  })

  it('should not modify role if user email is not in ADMIN_EMAILS', async () => {
    const updateSpy = vi.spyOn(db, 'update')

    vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
      session: {
        id: 'sess-5',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-regular',
        expiresAt: new Date(Date.now() + 86400000),
        token: 'tok-5',
      },
      user: {
        id: 'user-regular',
        email: 'regular@example.com',
        name: 'Regular User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'user',
        banned: false,
      },
    })
    const request = new Request('http://localhost:3000/api/me')

    const session = await getAuthSession(request)
    expect(session.user.role).toBe('user')
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
