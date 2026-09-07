import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { env } from '../env.server'

if (typeof window !== 'undefined') {
  throw new Error('src/lib/r2/client.ts is server-only')
}

export type StoredObjectLocator = {
  bucket: string
  key: string
}

export type PutStoredObjectInput = StoredObjectLocator & {
  body: Uint8Array
  contentType: string
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
})

export async function putObject({
  bucket,
  key,
  body,
  contentType,
}: PutStoredObjectInput): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  )
}

export async function getObject({
  bucket,
  key,
}: StoredObjectLocator): Promise<{ body: Buffer; contentType: string }> {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
  const bytes = response.Body
    ? await response.Body.transformToByteArray()
    : new Uint8Array()

  return {
    body: Buffer.from(bytes),
    contentType: response.ContentType ?? 'application/octet-stream',
  }
}

export async function deleteObject({
  bucket,
  key,
}: StoredObjectLocator): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  )
}

export const _s3 = s3
