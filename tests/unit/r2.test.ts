/**
 * @vitest-environment node
 */
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }))

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>(
    '@aws-sdk/client-s3',
  )
  return {
    ...actual,
    S3Client: vi.fn(function S3ClientMock() {
      return { send: sendMock }
    }),
  }
})

import { deleteObject, getObject, putObject } from '../../src/lib/r2/client'

describe('r2 client', () => {
  beforeEach(() => {
    sendMock.mockReset()
  })

  it('passes the explicit bucket and key to putObject', async () => {
    sendMock.mockResolvedValueOnce({})

    await putObject({
      bucket: 'write-bucket',
      key: 'users/u1/attachments/uuid/file.pdf',
      body: Buffer.from('hi'),
      contentType: 'application/pdf',
    })

    const command = sendMock.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(PutObjectCommand)
    if (!(command instanceof PutObjectCommand)) throw new Error('missing put')
    expect(command.input).toMatchObject({
      Bucket: 'write-bucket',
      Key: 'users/u1/attachments/uuid/file.pdf',
      ContentType: 'application/pdf',
    })
  })

  it('reads and fully consumes bytes from the explicit bucket and key', async () => {
    const transformToByteArray = vi
      .fn()
      .mockResolvedValue(new Uint8Array([35, 32, 72, 105]))
    sendMock.mockResolvedValueOnce({
      Body: { transformToByteArray },
      ContentType: 'text/markdown',
    })

    const result = await getObject({
      bucket: 'persisted-bucket',
      key: 'artifacts/exact.md',
    })

    const command = sendMock.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(GetObjectCommand)
    if (!(command instanceof GetObjectCommand)) throw new Error('missing get')
    expect(command.input).toMatchObject({
      Bucket: 'persisted-bucket',
      Key: 'artifacts/exact.md',
    })
    expect(transformToByteArray).toHaveBeenCalledOnce()
    expect(result.body).toEqual(Buffer.from('# Hi'))
    expect(result.contentType).toBe('text/markdown')
  })

  it('deletes from the explicit persisted bucket and key', async () => {
    sendMock.mockResolvedValueOnce({})

    await deleteObject({
      bucket: 'persisted-bucket',
      key: 'artifacts/exact.md',
    })

    const command = sendMock.mock.calls[0]?.[0]
    expect(command).toBeInstanceOf(DeleteObjectCommand)
    if (!(command instanceof DeleteObjectCommand))
      throw new Error('missing delete')
    expect(command.input).toMatchObject({
      Bucket: 'persisted-bucket',
      Key: 'artifacts/exact.md',
    })
  })
})
