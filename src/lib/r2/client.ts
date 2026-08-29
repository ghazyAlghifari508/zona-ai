import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

if (typeof window !== 'undefined') {
  throw new Error('src/lib/r2/client.ts is server-only')
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID as string}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
  },
})

export async function putObject({
  key,
  body,
  contentType,
}: {
  key: string
  body: Buffer | Uint8Array | ReadableStream | unknown
  contentType: string
}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME as string,
      Key: key,
      // cast boundary: S3 Body union includes Buffer/Uint8Array
      Body: body as Uint8Array,
      ContentType: contentType,
    }),
  )
}

export async function getObject(
  key: string,
): Promise<{ body: Buffer; contentType: string }> {
  const res = await s3.send(
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME as string,
      Key: key,
    }),
  )
  const bodyStream = res.Body as unknown
  let buffer: Buffer
  if (!bodyStream) {
    buffer = Buffer.alloc(0)
  } else if (Buffer.isBuffer(bodyStream)) {
    buffer = bodyStream
  } else if (bodyStream instanceof Uint8Array) {
    buffer = Buffer.from(bodyStream)
  } else if (
    typeof (bodyStream as Record<string, unknown>).transformToByteArray ===
    'function'
  ) {
    const arr = await (
      bodyStream as { transformToByteArray: () => Promise<Uint8Array> }
    ).transformToByteArray()
    buffer = Buffer.from(arr)
  } else if (
    typeof (bodyStream as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] ===
    'function'
  ) {
    const chunks: Uint8Array[] = []
    for await (const chunk of bodyStream as AsyncIterable<Uint8Array>) {
      chunks.push(chunk)
    }
    buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)))
  } else if (typeof (bodyStream as ReadableStream).getReader === 'function') {
    const reader = (bodyStream as ReadableStream<Uint8Array>).getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) chunks.push(value)
    }
    buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)))
  } else {
    // Fallback: treat as string or unknown
    buffer = Buffer.from(String(bodyStream))
  }

  return {
    body: buffer,
    contentType: (res.ContentType as string) ?? 'application/octet-stream',
  }
}

export async function deleteObject(key: string) {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME as string,
      Key: key,
    }),
  )
}

export const _s3 = s3
