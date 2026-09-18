import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../../lib/db/index'
import { artifactVersions } from '../../lib/db/schema'
import { getObject } from '../../lib/r2/client'
import { AppError } from '../../lib/utils/errors'
import { getOwnedArtifactVersion } from './artifact-repository'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-workspace.ts is server-only')
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function integrityError(): AppError {
  return new AppError(
    'Artifact content failed integrity verification.',
    500,
    'ERR-013',
  )
}

export async function readArtifactVersionContentCore({
  userId,
  artifactId,
  versionId,
}: {
  userId: string
  artifactId: string
  versionId: string
}): Promise<{ bytes: Uint8Array; contentSha256: string }> {
  const source = await getOwnedArtifactVersion({
    userId,
    artifactId,
    versionId,
  })
  const { body } = await getObject(source.locator)
  const bytes = new Uint8Array(body)
  if (bytes.byteLength > 5 * 1024 * 1024) {
    throw new AppError(
      'Artifact content exceeds maximum allowed size.',
      413,
      'ERR-003',
    )
  }
  const computedHash = sha256(bytes)

  if (source.contentSha256 && source.contentSha256 !== computedHash) {
    throw integrityError()
  }

  if (!source.contentSha256) {
    const initialized = await db
      .update(artifactVersions)
      .set({ contentSha256: computedHash })
      .where(
        and(
          eq(artifactVersions.id, versionId),
          eq(artifactVersions.artifactId, artifactId),
          isNull(artifactVersions.contentSha256),
        ),
      )
      .returning({ contentSha256: artifactVersions.contentSha256 })

    if (initialized.length === 0) {
      const [current] = await db
        .select({ contentSha256: artifactVersions.contentSha256 })
        .from(artifactVersions)
        .where(
          and(
            eq(artifactVersions.id, versionId),
            eq(artifactVersions.artifactId, artifactId),
          ),
        )
        .limit(1)
      if (current?.contentSha256 !== computedHash) throw integrityError()
    }
  }

  return { bytes, contentSha256: computedHash }
}
