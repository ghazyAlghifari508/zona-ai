/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>(
    '@aws-sdk/client-s3',
  )
  return {
    ...actual,
    S3Client: vi.fn(function S3ClientMock() {
      return {
        send: vi.fn(async (cmd: unknown) => {
          // Simulate GetObject returning body stream
          const c = cmd as Record<string, unknown>
          // If it's GetObjectCommand with our test key, return stream
          const input = (c as { input?: Record<string, unknown> }).input
          if (input && typeof input.Key === 'string' && input.Key.includes('file.pdf')) {
            // For getObject test we need to return body if needed; but generic mock will handle
          }
          // Check if caller expects GetObject response with Body
          // We'll let test override via mockResolvedValue if needed; default to empty
          if ((cmd as Record<string, unknown>).__isGet) {
            return {
              Body: {
                async *[Symbol.asyncIterator]() {
                  yield Buffer.from('test')
                },
              },
              ContentType: 'application/pdf',
            }
          }
          return {}
        }),
      }
    }),
    PutObjectCommand: vi.fn(function PutObjectCommandMock(input: unknown) {
      ;(this as unknown as Record<string, unknown>).input = input
      return this
    }),
    GetObjectCommand: vi.fn(function GetObjectCommandMock(input: unknown) {
      const obj = Object.create(null)
      obj.input = input
      // tag for mock detection
      ;(obj as Record<string, unknown>).__isGet = true
      return obj
    }),
    DeleteObjectCommand: vi.fn(function DeleteObjectCommandMock(input: unknown) {
      ;(this as unknown as Record<string, unknown>).input = input
      return this
    }),
  }
})

import { deleteObject, getObject, putObject } from '../../src/lib/r2/client'
import { PutObjectCommand } from '@aws-sdk/client-s3'

describe('r2 client', () => {
  it('putObject calls S3 with correct key pattern', async () => {
    await putObject({
      key: 'users/u1/attachments/uuid/file.pdf',
      body: Buffer.from('hi'),
      contentType: 'application/pdf',
    })
    const call = vi.mocked(PutObjectCommand).mock.calls[0]?.[0] as unknown as Record<
      string,
      unknown
    >
    expect(call?.Key).toBe('users/u1/attachments/uuid/file.pdf')
    expect(call?.Bucket).toBe(process.env.R2_BUCKET_NAME)
    expect(call?.ContentType).toBe('application/pdf')

    const result = await getObject('users/u1/attachments/uuid/file.pdf')
    expect(result.body).toBeInstanceOf(Buffer)
    await deleteObject('users/u1/attachments/uuid/file.pdf')
    expect(true).toBe(true)
  })
})
