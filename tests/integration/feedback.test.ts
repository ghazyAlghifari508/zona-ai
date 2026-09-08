/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auth } from '../../src/lib/auth/auth'
import { db } from '../../src/lib/db/index'
import { auditLogs, feedback, users } from '../../src/lib/db/schema'
import { putObject } from '../../src/lib/r2/client'
import { AppError } from '../../src/lib/utils/errors'
import {
  getFeedbackDetailCore,
  listFeedbackCore,
  submitFeedbackCore,
  updateFeedbackStatusCore,
  uploadFeedbackAttachmentCore,
} from '../../src/server/core/feedback'
import {
  getFeedbackDetailFn,
  getFeedbackDetailSchema,
  listFeedbackFn,
  listFeedbackSchema,
  submitFeedbackFn,
  submitFeedbackSchema,
  updateFeedbackStatusFn,
  updateFeedbackStatusSchema,
} from '../../src/server/functions/feedback'

vi.mock('../../src/lib/r2/client', () => ({
  putObject: vi.fn(async () => {}),
  getObject: vi.fn(async () => ({
    body: Buffer.from('mock-file-content'),
    contentType: 'image/png',
  })),
  deleteObject: vi.fn(async () => {}),
}))

describe('Feedback System Core and Functions', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  describe('Exports and Schemas', () => {
    it('should export all required core and server functions', () => {
      expect(typeof submitFeedbackCore).toBe('function')
      expect(typeof listFeedbackCore).toBe('function')
      expect(typeof updateFeedbackStatusCore).toBe('function')
      expect(typeof getFeedbackDetailCore).toBe('function')
      expect(typeof uploadFeedbackAttachmentCore).toBe('function')

      expect(typeof submitFeedbackFn).toBe('function')
      expect(typeof listFeedbackFn).toBe('function')
      expect(typeof updateFeedbackStatusFn).toBe('function')
      expect(typeof getFeedbackDetailFn).toBe('function')
    })

    it('should validate submitFeedbackSchema properly', () => {
      const validGeneral = submitFeedbackSchema.safeParse({
        type: 'general',
        title: 'Bagus sekali layanannya',
        description: 'Tampilan antarmuka sangat bersih dan mudah dipahami.',
      })
      expect(validGeneral.success).toBe(true)

      const validBug = submitFeedbackSchema.safeParse({
        type: 'bug',
        title: 'Error saat upload gambar',
        description: 'Gagal mengunggah gambar PNG',
        stepsToReproduce: '1. Masuk chat\n2. Klik upload',
        expectedBehavior: 'Gambar berhasil diunggah',
        actualBehavior: 'Muncul pesan error merah',
        attachmentR2Key: 'feedback/u1/f1/shot.png',
        attachmentFileName: 'shot.png',
        attachmentMimeType: 'image/png',
        attachmentFileSize: 1024,
      })
      expect(validBug.success).toBe(true)

      const invalidType = submitFeedbackSchema.safeParse({
        type: 'unknown_type',
        title: 'Test',
        description: 'Test desc',
      })
      expect(invalidType.success).toBe(false)

      const emptyTitle = submitFeedbackSchema.safeParse({
        type: 'general',
        title: '',
        description: 'Test desc',
      })
      expect(emptyTitle.success).toBe(false)
    })

    it('should validate listFeedbackSchema properly', () => {
      const defaults = listFeedbackSchema.parse({})
      expect(defaults.page).toBe(1)
      expect(defaults.limit).toBe(20)

      const filtered = listFeedbackSchema.parse({
        status: 'new',
        type: 'bug',
        page: 2,
        limit: 15,
      })
      expect(filtered.status).toBe('new')
      expect(filtered.type).toBe('bug')
      expect(filtered.page).toBe(2)
      expect(filtered.limit).toBe(15)
    })

    it('should validate updateFeedbackStatusSchema properly', () => {
      const validUpdate = updateFeedbackStatusSchema.safeParse({
        feedbackId: '00000000-0000-0000-0000-000000000001',
        status: 'in_progress',
        adminNotes: 'Sedang dicek oleh tim developer',
      })
      expect(validUpdate.success).toBe(true)

      const invalidStatus = updateFeedbackStatusSchema.safeParse({
        feedbackId: '00000000-0000-0000-0000-000000000001',
        status: 'invalid_status',
      })
      expect(invalidStatus.success).toBe(false)
    })

    it('should validate getFeedbackDetailSchema properly', () => {
      const valid = getFeedbackDetailSchema.safeParse({
        feedbackId: '00000000-0000-0000-0000-000000000001',
      })
      expect(valid.success).toBe(true)

      const empty = getFeedbackDetailSchema.safeParse({
        feedbackId: '',
      })
      expect(empty.success).toBe(false)
    })
  })

  describe('submitFeedbackCore', () => {
    it('should reject unauthenticated request with 401', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(null)

      const request = new Request('http://localhost:3000/api/feedback')
      await expect(
        submitFeedbackCore({
          request,
          data: {
            type: 'general',
            title: 'Saran',
            description: 'Halo ZonaAI',
          },
        }),
      ).rejects.toThrowError(AppError)
    })

    it('should reject banned user with 403', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-banned',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-banned',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-banned',
        },
        user: {
          id: 'user-banned',
          email: 'banned@example.com',
          name: 'Banned User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: true,
          banReason: 'Spamming',
        },
      })

      const request = new Request('http://localhost:3000/api/feedback')
      await expect(
        submitFeedbackCore({
          request,
          data: {
            type: 'bug',
            title: 'Bug report',
            description: 'Ada kendala sistem',
          },
        }),
      ).rejects.toThrowError('Akun Anda telah dinonaktifkan: Spamming.')
    })

    it('should insert feedback with status new and return the created record', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-valid',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-valid',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-valid',
        },
        user: {
          id: 'user-valid',
          email: 'user@example.com',
          name: 'Normal User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: false,
        },
      })

      const insertedRecord = {
        id: 'fb-123',
        userId: 'user-valid',
        type: 'bug',
        title: 'Button error',
        description: 'Tombol tidak merespon saat diklik',
        stepsToReproduce: 'Klik tombol',
        expectedBehavior: 'Modal terbuka',
        actualBehavior: 'Tidak ada reaksi',
        attachmentR2Key: 'feedback/user-valid/fb-123/shot.png',
        attachmentFileName: 'shot.png',
        attachmentMimeType: 'image/png',
        attachmentFileSize: 2048,
        status: 'new',
        adminNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      vi.spyOn(db, 'insert').mockImplementationOnce(() => ({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([insertedRecord]),
        }),
      } as unknown as ReturnType<typeof db.insert>))

      const request = new Request('http://localhost:3000/api/feedback')
      const result = await submitFeedbackCore({
        request,
        data: {
          type: 'bug',
          title: 'Button error',
          description: 'Tombol tidak merespon saat diklik',
          stepsToReproduce: 'Klik tombol',
          expectedBehavior: 'Modal terbuka',
          actualBehavior: 'Tidak ada reaksi',
          attachmentR2Key: 'feedback/user-valid/fb-123/shot.png',
          attachmentFileName: 'shot.png',
          attachmentMimeType: 'image/png',
          attachmentFileSize: 2048,
        },
      })

      expect(result.success).toBe(true)
      expect(result.feedback.id).toBe('fb-123')
      expect(result.feedback.status).toBe('new')
      expect(result.feedback.type).toBe('bug')
    })
  })

  describe('listFeedbackCore', () => {
    it('should reject non-admin users with 403', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-user',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-regular',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-user',
        },
        user: {
          id: 'user-regular',
          email: 'user@example.com',
          name: 'Regular User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: false,
        },
      })

      const request = new Request('http://localhost:3000/api/admin/feedback')
      await expect(listFeedbackCore({ request })).rejects.toThrowError(AppError)
    })

    it('should return paginated list of feedback with joined user details for admin', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-admin',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'admin-id',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-admin',
        },
        user: {
          id: 'admin-id',
          email: 'admin@zona.ai',
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      const mockFeedbackRows = [
        {
          id: 'fb-1',
          userId: 'user-1',
          type: 'feature',
          title: 'Mode gelap otomatis',
          description: 'Tambahkan opsi mengikuti preferensi OS',
          stepsToReproduce: null,
          expectedBehavior: null,
          actualBehavior: null,
          attachmentR2Key: null,
          attachmentFileName: null,
          attachmentMimeType: null,
          attachmentFileSize: null,
          status: 'new',
          adminNotes: null,
          createdAt: new Date('2026-02-01'),
          updatedAt: new Date('2026-02-01'),
          userName: 'Budi Santoso',
          userEmail: 'budi@example.com',
          userImage: null,
        },
      ]

      let selectCalls = 0
      vi.spyOn(db, 'select').mockImplementation(() => {
        selectCalls++
        if (selectCalls === 1) {
          // count
          return {
            from: vi.fn().mockReturnValue({
              where: vi.fn().mockResolvedValue([{ total: 1 }]),
            }),
          } as unknown as ReturnType<typeof db.select>
        }
        // records
        return {
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              where: vi.fn().mockReturnValue({
                orderBy: vi.fn().mockReturnValue({
                  limit: vi.fn().mockReturnValue({
                    offset: vi.fn().mockResolvedValue(mockFeedbackRows),
                  }),
                }),
              }),
            }),
          }),
        } as unknown as ReturnType<typeof db.select>
      })

      const request = new Request('http://localhost:3000/api/admin/feedback')
      const result = await listFeedbackCore({
        request,
        status: 'new',
        type: 'feature',
        page: 1,
        limit: 20,
      })

      expect(result.total).toBe(1)
      expect(result.page).toBe(1)
      expect(result.limit).toBe(20)
      expect(result.feedback).toEqual(mockFeedbackRows)
    })
  })

  describe('getFeedbackDetailCore', () => {
    it('should reject non-admin request with 403', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-user',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-regular',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-user',
        },
        user: {
          id: 'user-regular',
          email: 'user@example.com',
          name: 'Regular User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: false,
        },
      })

      const request = new Request('http://localhost:3000/api/admin/feedback/fb-1')
      await expect(
        getFeedbackDetailCore({ request, feedbackId: 'fb-1' }),
      ).rejects.toThrowError(AppError)
    })

    it('should throw 404 when feedback does not exist', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-admin',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'admin-id',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-admin',
        },
        user: {
          id: 'admin-id',
          email: 'admin@zona.ai',
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      vi.spyOn(db, 'select').mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>))

      const request = new Request('http://localhost:3000/api/admin/feedback/fb-missing')
      await expect(
        getFeedbackDetailCore({ request, feedbackId: 'fb-missing' }),
      ).rejects.toThrowError('Feedback tidak ditemukan.')
    })

    it('should return feedback detail for admin', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-admin',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'admin-id',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-admin',
        },
        user: {
          id: 'admin-id',
          email: 'admin@zona.ai',
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      const mockFeedback = {
        id: 'fb-1',
        userId: 'user-1',
        type: 'general',
        title: 'Tampilan bersih',
        description: 'Sangat nyaman digunakan',
        stepsToReproduce: null,
        expectedBehavior: null,
        actualBehavior: null,
        attachmentR2Key: null,
        attachmentFileName: null,
        attachmentMimeType: null,
        attachmentFileSize: null,
        status: 'new',
        adminNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        userName: 'User One',
        userEmail: 'user1@example.com',
        userImage: null,
      }

      vi.spyOn(db, 'select').mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([mockFeedback]),
          }),
        }),
      } as unknown as ReturnType<typeof db.select>))

      const request = new Request('http://localhost:3000/api/admin/feedback/fb-1')
      const result = await getFeedbackDetailCore({ request, feedbackId: 'fb-1' })
      expect(result.id).toBe('fb-1')
      expect(result.userName).toBe('User One')
    })
  })

  describe('updateFeedbackStatusCore', () => {
    it('should reject non-admin request with 403', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-user',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'user-regular',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-user',
        },
        user: {
          id: 'user-regular',
          email: 'user@example.com',
          name: 'Regular User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'user',
          banned: false,
        },
      })

      const request = new Request('http://localhost:3000/api/admin/feedback/status')
      await expect(
        updateFeedbackStatusCore({
          request,
          data: {
            feedbackId: 'fb-1',
            status: 'in_progress',
          },
        }),
      ).rejects.toThrowError(AppError)
    })

    it('should throw 404 if feedback does not exist', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-admin',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'admin-id',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-admin',
        },
        user: {
          id: 'admin-id',
          email: 'admin@zona.ai',
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      vi.spyOn(db, 'select').mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as unknown as ReturnType<typeof db.select>))

      const request = new Request('http://localhost:3000/api/admin/feedback/status')
      await expect(
        updateFeedbackStatusCore({
          request,
          data: {
            feedbackId: 'fb-404',
            status: 'resolved',
          },
        }),
      ).rejects.toThrowError('Feedback tidak ditemukan.')
    })

    it('should update feedback status and record audit log', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce({
        session: {
          id: 's-admin',
          createdAt: new Date(),
          updatedAt: new Date(),
          userId: 'admin-id',
          expiresAt: new Date(Date.now() + 86400000),
          token: 'tok-admin',
        },
        user: {
          id: 'admin-id',
          email: 'admin@zona.ai',
          name: 'Admin User',
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          role: 'admin',
          banned: false,
        },
      })

      const existing = {
        id: 'fb-1',
        status: 'new',
        adminNotes: null,
      }

      vi.spyOn(db, 'select').mockImplementationOnce(() => ({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([existing]),
        }),
      } as unknown as ReturnType<typeof db.select>))

      const updated = {
        ...existing,
        status: 'resolved',
        adminNotes: 'Sudah diperbaiki pada patch v1.2',
        updatedAt: new Date(),
      }

      vi.spyOn(db, 'update').mockImplementationOnce(() => ({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      } as unknown as ReturnType<typeof db.update>))

      const auditInsertSpy = vi.fn().mockResolvedValue({})
      vi.spyOn(db, 'insert').mockImplementationOnce(() => ({
        values: auditInsertSpy,
      } as unknown as ReturnType<typeof db.insert>))

      const request = new Request('http://localhost:3000/api/admin/feedback/status')
      const result = await updateFeedbackStatusCore({
        request,
        data: {
          feedbackId: 'fb-1',
          status: 'resolved',
          adminNotes: 'Sudah diperbaiki pada patch v1.2',
        },
      })

      expect(result.success).toBe(true)
      expect(result.feedback.status).toBe('resolved')
      expect(result.feedback.adminNotes).toBe('Sudah diperbaiki pada patch v1.2')
      expect(auditInsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'feedback.status_update',
          targetId: 'fb-1',
          targetType: 'feedback',
          adminId: 'admin-id',
          adminEmail: 'admin@zona.ai',
          metadata: {
            previousStatus: 'new',
            status: 'resolved',
            adminNotes: 'Sudah diperbaiki pada patch v1.2',
          },
        }),
      )
    })
  })

  describe('uploadFeedbackAttachmentCore', () => {
    it('should reject unauthenticated request with 401', async () => {
      vi.spyOn(auth.api, 'getSession').mockResolvedValueOnce(null)

      const request = new Request('http://localhost:3000/api/feedback/upload', {
        method: 'POST',
      })
      await expect(
        uploadFeedbackAttachmentCore({ request }),
      ).rejects.toThrowError(AppError)
    })

    it('should reject request without file with 400', async () => {
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

      const formData = new FormData()
      const request = new Request('http://localhost:3000/api/feedback/upload', {
        method: 'POST',
        body: formData,
      })

      await expect(
        uploadFeedbackAttachmentCore({ request }),
      ).rejects.toThrowError('Berkas lampiran tidak ditemukan.')
    })

    it('should reject file exceeding 10MB with 413', async () => {
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

      const oversizeFile = new File(['x'.repeat(100)], 'large.png', {
        type: 'image/png',
      })
      Object.defineProperty(oversizeFile, 'size', {
        value: 11 * 1024 * 1024,
      })

      const formData = new FormData()
      formData.append('file', oversizeFile)

      const request = new Request('http://localhost:3000/api/feedback/upload', {
        method: 'POST',
      })
      vi.spyOn(request, 'formData').mockResolvedValueOnce(formData)

      await expect(
        uploadFeedbackAttachmentCore({ request }),
      ).rejects.toThrowError('Ukuran file maksimal 10MB.')
    })

    it('should reject unsupported MIME type with 400', async () => {
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

      const exeFile = new File(['test'], 'program.exe', {
        type: 'application/x-msdownload',
      })
      const formData = new FormData()
      formData.append('file', exeFile)

      const request = new Request('http://localhost:3000/api/feedback/upload', {
        method: 'POST',
        body: formData,
      })

      await expect(
        uploadFeedbackAttachmentCore({ request }),
      ).rejects.toThrowError('Format file tidak didukung. Harap unggah gambar (PNG, JPG, WebP) atau dokumen PDF.')
    })

    it('should upload valid PNG screenshot to R2 and return metadata', async () => {
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

      // PNG magic bytes header: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
      const pngHeader = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      ])
      const validPngFile = new File([pngHeader], 'error-screenshot.png', {
        type: 'image/png',
      })

      const formData = new FormData()
      formData.append('file', validPngFile)
      formData.append('feedbackId', 'custom-fb-id')

      const request = new Request('http://localhost:3000/api/feedback/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await uploadFeedbackAttachmentCore({ request })
      expect(result.success).toBe(true)
      expect(result.r2Key).toBe('feedback/user-1/custom-fb-id/error-screenshot.png')
      expect(result.fileName).toBe('error-screenshot.png')
      expect(result.mimeType).toBe('image/png')
      expect(putObject).toHaveBeenCalledWith(
        expect.objectContaining({
          key: 'feedback/user-1/custom-fb-id/error-screenshot.png',
          contentType: 'image/png',
        }),
      )
    })
  })
})
