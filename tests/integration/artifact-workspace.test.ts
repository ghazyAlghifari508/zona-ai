/**
 * @vitest-environment node
 */
import { and, eq, inArray } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../src/lib/db/index'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  generationRuns,
  messages,
  users,
} from '../../src/lib/db/schema'

const { getObjectMock } = vi.hoisted(() => ({ getObjectMock: vi.fn() }))

vi.mock('../../src/lib/r2/client', () => ({
  putObject: vi.fn(async () => {}),
  getObject: getObjectMock,
  deleteObject: vi.fn(async () => {}),
}))

vi.mock('../../src/lib/auth/session', () => ({
  getAuthSession: vi.fn(async (request: Request) => ({
    user: {
      id: request.headers.get('x-test-user') ?? 'artifact-workspace-owner',
      email: 'workspace@example.com',
    },
  })),
}))

import {
  getOwnedArtifact,
  getOwnedArtifactVersion,
  listConversationArtifactSummaries,
} from '../../src/server/core/artifact-repository'
import { readArtifactVersionContentCore } from '../../src/server/core/artifact-workspace'
import {
  getArtifactCore,
  listConversationArtifactsCore,
} from '../../src/server/functions/artifacts'
import { getArtifactVersionRoute } from '../../src/routes/api/artifacts/$artifactId/versions/$versionId'

const OWNER_ID = 'artifact-workspace-owner'
const OTHER_USER_ID = 'artifact-workspace-other'
const EXACT_MARKDOWN = '# Exact artifact\n\nCanonical bytes.\n'
const EXACT_SHA256 =
  'a952684fc228199300573a2e9d743bce0cce67f962686fb92e3c9e282c673b61'

type SeededArtifact = {
  artifactId: string
  versionId: string
  attachmentId: string
  generationId: string
  conversationId: string
  r2Key: string
}

async function seedArtifact(input: {
  userId: string
  conversationId: string
  title: string
  contentSha256?: string | null
  mimeType?: string
}): Promise<SeededArtifact> {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: 'assistant',
      content: 'Artifact ready.',
    })
    .returning({ id: messages.id })
  if (!message) throw new Error('message fixture failed')

  const [generation] = await db
    .insert(generationRuns)
    .values({
      messageId: message.id,
      conversationId: input.conversationId,
      modelId: 'internal-model',
      routerModelId: 'router/model',
      skillId: 'prd-plan',
      status: 'completed',
      content: 'operational copy must not leak',
    })
    .returning({ id: generationRuns.id })
  if (!generation) throw new Error('generation fixture failed')

  const r2Key = `workspace/${crypto.randomUUID()}/artifact.md`
  const [attachment] = await db
    .insert(attachments)
    .values({
      userId: input.userId,
      messageId: message.id,
      conversationId: input.conversationId,
      fileName: 'artifact.md',
      fileSize: Buffer.byteLength(EXACT_MARKDOWN),
      mimeType: input.mimeType ?? 'text/markdown',
      r2Key,
      r2Bucket: 'persisted-artifact-bucket',
      processingStatus: 'completed',
      extractedText: 'extracted copy must not leak',
    })
    .returning({ id: attachments.id })
  if (!attachment) throw new Error('attachment fixture failed')

  const [artifact] = await db
    .insert(artifacts)
    .values({
      userId: input.userId,
      conversationId: input.conversationId,
      kind: 'prd',
      title: input.title,
    })
    .returning({ id: artifacts.id })
  if (!artifact) throw new Error('artifact fixture failed')

  const [version] = await db
    .insert(artifactVersions)
    .values({
      artifactId: artifact.id,
      conversationId: input.conversationId,
      version: 1,
      attachmentId: attachment.id,
      generationRunId: generation.id,
      title: input.title,
      contentSha256: input.contentSha256,
      createdByModelId: 'internal-model',
      createdByRouterModelId: 'router/model',
      changeSummary: 'Created artifact',
    })
    .returning({ id: artifactVersions.id })
  if (!version) throw new Error('version fixture failed')

  await db
    .update(artifacts)
    .set({ currentVersionId: version.id })
    .where(eq(artifacts.id, artifact.id))

  return {
    artifactId: artifact.id,
    versionId: version.id,
    attachmentId: attachment.id,
    generationId: generation.id,
    conversationId: input.conversationId,
    r2Key,
  }
}

async function cleanup(): Promise<void> {
  await db.delete(users).where(inArray(users.id, [OWNER_ID, OTHER_USER_ID]))
}

describe('artifact workspace reads', () => {
  let ownerConversationId = ''
  let otherOwnerConversationId = ''
  let otherUserConversationId = ''
  let ownerArtifact: SeededArtifact
  let otherConversationArtifact: SeededArtifact
  let otherUserArtifact: SeededArtifact

  beforeEach(async () => {
    await cleanup()
    await db.insert(users).values([
      { id: OWNER_ID, email: 'workspace-owner@example.com', name: 'Owner' },
      {
        id: OTHER_USER_ID,
        email: 'workspace-other@example.com',
        name: 'Other',
      },
    ])
    const seededConversations = await db
      .insert(conversations)
      .values([
        { userId: OWNER_ID, title: 'Owner conversation' },
        { userId: OWNER_ID, title: 'Another owner conversation' },
        { userId: OTHER_USER_ID, title: 'Other user conversation' },
      ])
      .returning({ id: conversations.id, userId: conversations.userId })
    const ownerConversations = seededConversations.filter(
      (conversation) => conversation.userId === OWNER_ID,
    )
    ownerConversationId = ownerConversations[0]?.id ?? ''
    otherOwnerConversationId = ownerConversations[1]?.id ?? ''
    otherUserConversationId =
      seededConversations.find(
        (conversation) => conversation.userId === OTHER_USER_ID,
      )?.id ?? ''
    if (
      !ownerConversationId ||
      !otherOwnerConversationId ||
      !otherUserConversationId
    ) {
      throw new Error('conversation fixtures failed')
    }

    ownerArtifact = await seedArtifact({
      userId: OWNER_ID,
      conversationId: ownerConversationId,
      title: 'Owner artifact',
      contentSha256: null,
    })
    otherConversationArtifact = await seedArtifact({
      userId: OWNER_ID,
      conversationId: otherOwnerConversationId,
      title: 'Other conversation artifact',
      contentSha256: EXACT_SHA256,
    })
    otherUserArtifact = await seedArtifact({
      userId: OTHER_USER_ID,
      conversationId: otherUserConversationId,
      title: 'Other user artifact',
      contentSha256: EXACT_SHA256,
    })

    getObjectMock.mockReset()
    getObjectMock.mockResolvedValue({
      body: Buffer.from(EXACT_MARKDOWN),
      contentType: 'text/markdown',
    })
  })

  afterAll(cleanup)

  it('lists only safe current artifact summaries for the owned conversation', async () => {
    const result = await listConversationArtifactsCore({
      data: { conversationId: ownerConversationId },
      request: new Request('http://localhost/', {
        headers: { 'x-test-user': OWNER_ID },
      }),
    })

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      artifactId: ownerArtifact.artifactId,
      currentVersionId: ownerArtifact.versionId,
      attachmentId: ownerArtifact.attachmentId,
      currentVersion: 1,
      versionCount: 1,
    })
    expect(JSON.stringify(result)).not.toContain(ownerArtifact.r2Key)
    expect(JSON.stringify(result)).not.toContain('persisted-artifact-bucket')
    expect(JSON.stringify(result)).not.toContain('extracted copy must not leak')
    expect(JSON.stringify(result)).not.toContain('operational copy must not leak')
  })

  it('returns safe ordered artifact detail metadata without storage fields', async () => {
    const result = await getArtifactCore({
      data: { artifactId: ownerArtifact.artifactId },
      request: new Request('http://localhost/', {
        headers: { 'x-test-user': OWNER_ID },
      }),
    })

    expect(result.artifactId).toBe(ownerArtifact.artifactId)
    expect(result.versions).toHaveLength(1)
    expect(result.versions[0]).toMatchObject({
      versionId: ownerArtifact.versionId,
      attachmentId: ownerArtifact.attachmentId,
      generationId: ownerArtifact.generationId,
      version: 1,
    })
    expect(JSON.stringify(result)).not.toContain(ownerArtifact.r2Key)
    expect(JSON.stringify(result)).not.toContain('persisted-artifact-bucket')
    expect(JSON.stringify(result)).not.toContain('extracted copy must not leak')
    expect(JSON.stringify(result)).not.toContain('operational copy must not leak')
  })

  it('authorizes the complete owner, artifact, version, attachment, and generation chain', async () => {
    const source = await getOwnedArtifactVersion({
      userId: OWNER_ID,
      artifactId: ownerArtifact.artifactId,
      versionId: ownerArtifact.versionId,
    })

    expect(source).toMatchObject({
      artifactId: ownerArtifact.artifactId,
      versionId: ownerArtifact.versionId,
      conversationId: ownerConversationId,
      locator: {
        bucket: 'persisted-artifact-bucket',
        key: ownerArtifact.r2Key,
      },
    })
  })

  it('rejects another user and mismatched cross-conversation pairs before storage access', async () => {
    await expect(
      getOwnedArtifactVersion({
        userId: OTHER_USER_ID,
        artifactId: ownerArtifact.artifactId,
        versionId: ownerArtifact.versionId,
      }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      readArtifactVersionContentCore({
        userId: OWNER_ID,
        artifactId: ownerArtifact.artifactId,
        versionId: otherConversationArtifact.versionId,
      }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      readArtifactVersionContentCore({
        userId: OWNER_ID,
        artifactId: otherUserArtifact.artifactId,
        versionId: otherUserArtifact.versionId,
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(getObjectMock).not.toHaveBeenCalled()
  })

  it('rejects a broken attachment and generation message chain before storage access', async () => {
    const [unrelatedMessage] = await db
      .insert(messages)
      .values({
        conversationId: ownerConversationId,
        role: 'assistant',
        content: 'Unrelated message.',
      })
      .returning({ id: messages.id })
    if (!unrelatedMessage) throw new Error('unrelated message fixture failed')
    await db
      .update(attachments)
      .set({ messageId: unrelatedMessage.id })
      .where(eq(attachments.id, ownerArtifact.attachmentId))

    await expect(
      readArtifactVersionContentCore({
        userId: OWNER_ID,
        artifactId: ownerArtifact.artifactId,
        versionId: ownerArtifact.versionId,
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(getObjectMock).not.toHaveBeenCalled()
  })

  it('rejects listing a conversation owned by another user', async () => {
    await expect(
      listConversationArtifactSummaries({
        userId: OWNER_ID,
        conversationId: otherUserConversationId,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('reads exact R2 bytes from the persisted bucket and initializes a legacy null hash', async () => {
    const result = await readArtifactVersionContentCore({
      userId: OWNER_ID,
      artifactId: ownerArtifact.artifactId,
      versionId: ownerArtifact.versionId,
    })

    expect(Buffer.from(result.bytes).toString('utf8')).toBe(EXACT_MARKDOWN)
    expect(result.contentSha256).toBe(EXACT_SHA256)
    expect(getObjectMock).toHaveBeenCalledWith({
      bucket: 'persisted-artifact-bucket',
      key: ownerArtifact.r2Key,
    })
    const [persisted] = await db
      .select({ contentSha256: artifactVersions.contentSha256 })
      .from(artifactVersions)
      .where(eq(artifactVersions.id, ownerArtifact.versionId))
    expect(persisted?.contentSha256).toBe(EXACT_SHA256)
  })

  it('reads a legacy Markdown filename whose persisted MIME predates normalization', async () => {
    const legacy = await seedArtifact({
      userId: OWNER_ID,
      conversationId: ownerConversationId,
      title: 'Legacy MIME artifact',
      contentSha256: null,
      mimeType: 'application/octet-stream',
    })

    const detail = await getOwnedArtifact({
      userId: OWNER_ID,
      artifactId: legacy.artifactId,
    })
    const content = await readArtifactVersionContentCore({
      userId: OWNER_ID,
      artifactId: legacy.artifactId,
      versionId: legacy.versionId,
    })

    expect(detail.versions[0]?.mimeType).toBe('text/markdown')
    expect(Buffer.from(content.bytes).toString('utf8')).toBe(EXACT_MARKDOWN)
  })

  it('serves exact Markdown bytes with private integrity headers and a 304 validator', async () => {
    await db
      .update(artifactVersions)
      .set({ contentSha256: EXACT_SHA256 })
      .where(eq(artifactVersions.id, ownerArtifact.versionId))
    const request = new Request('http://localhost/api/artifacts/content', {
      headers: { 'x-test-user': OWNER_ID },
    })

    const response = await getArtifactVersionRoute({
      request,
      params: {
        artifactId: ownerArtifact.artifactId,
        versionId: ownerArtifact.versionId,
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe(
      'text/markdown; charset=utf-8',
    )
    expect(response.headers.get('Cache-Control')).toContain('private')
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('ETag')).toBe(`"${EXACT_SHA256}"`)
    expect(response.headers.get('Content-Length')).toBe(
      String(Buffer.byteLength(EXACT_MARKDOWN)),
    )
    expect(await response.text()).toBe(EXACT_MARKDOWN)

    const notModified = await getArtifactVersionRoute({
      request: new Request('http://localhost/api/artifacts/content', {
        headers: {
          'x-test-user': OWNER_ID,
          'If-None-Match': `"${EXACT_SHA256}"`,
        },
      }),
      params: {
        artifactId: ownerArtifact.artifactId,
        versionId: ownerArtifact.versionId,
      },
    })
    expect(notModified.status).toBe(304)
    expect(notModified.headers.get('ETag')).toBe(`"${EXACT_SHA256}"`)
    expect(await notModified.text()).toBe('')
  })

  it('fails closed with safe JSON when stored content integrity does not match', async () => {
    await db
      .update(artifactVersions)
      .set({ contentSha256: '0'.repeat(64) })
      .where(eq(artifactVersions.id, ownerArtifact.versionId))

    const response = await getArtifactVersionRoute({
      request: new Request('http://localhost/api/artifacts/content', {
        headers: { 'x-test-user': OWNER_ID },
      }),
      params: {
        artifactId: ownerArtifact.artifactId,
        versionId: ownerArtifact.versionId,
      },
    })

    expect(response.status).toBe(500)
    expect(response.headers.get('Content-Type')).toContain('application/json')
    expect(await response.json()).toMatchObject({
      code: 'ERR-013',
      status: 500,
    })
  })

  it('rejects malformed route IDs before storage access', async () => {
    const response = await getArtifactVersionRoute({
      request: new Request('http://localhost/api/artifacts/content', {
        headers: { 'x-test-user': OWNER_ID },
      }),
      params: { artifactId: 'invalid', versionId: 'invalid' },
    })

    expect(response.status).toBe(400)
    expect(getObjectMock).not.toHaveBeenCalled()
  })
})
