/**
 * @vitest-environment node
 */

import { readFile } from 'node:fs/promises'
import { and, count, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  generationRuns,
  messages,
  users,
} from '../../src/lib/db/schema'

const USER_ID = 'artifact-schema-owner'
const USER_EMAIL = 'artifact-schema-owner@example.com'

async function resetFixture() {
  await db.delete(users).where(eq(users.id, USER_ID))
  await db.insert(users).values({
    id: USER_ID,
    email: USER_EMAIL,
    name: 'Artifact schema owner',
  })
}

async function createConversation() {
  const [conversation] = await db
    .insert(conversations)
    .values({ userId: USER_ID, title: 'Artifact schema fixture' })
    .returning({ id: conversations.id })
  if (!conversation) throw new Error('Conversation fixture was not created')
  return conversation.id
}

async function createGenerationFixture(input: {
  conversationId: string
  role?: 'user' | 'assistant'
  skillId?: string
  status?: string
  fileName?: string
  mimeType?: string
}) {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      role: input.role ?? 'assistant',
      content: 'Synthetic artifact schema fixture',
    })
    .returning({ id: messages.id })
  if (!message) throw new Error('Message fixture was not created')

  const [generation] = await db
    .insert(generationRuns)
    .values({
      messageId: message.id,
      conversationId: input.conversationId,
      modelId: 'model-internal',
      routerModelId: 'router/model',
      skillId: input.skillId ?? 'prd-plan',
      status: input.status ?? 'completed',
    })
    .returning({ id: generationRuns.id })
  if (!generation) throw new Error('Generation fixture was not created')

  const fileName = input.fileName ?? 'artifact.md'
  const [attachment] = await db
    .insert(attachments)
    .values({
      userId: USER_ID,
      messageId: message.id,
      conversationId: input.conversationId,
      fileName,
      fileSize: 128,
      mimeType: input.mimeType ?? 'text/markdown',
      r2Key: `artifact-schema/${crypto.randomUUID()}/${fileName}`,
      r2Bucket: 'artifact-schema-fixture',
      processingStatus: 'completed',
    })
    .returning({ id: attachments.id })
  if (!attachment) throw new Error('Attachment fixture was not created')

  return {
    messageId: message.id,
    generationId: generation.id,
    attachmentId: attachment.id,
  }
}

async function createArtifactWithVersion(input: {
  conversationId: string
  generationId: string
  attachmentId: string
  sourceVersionId?: string
  title?: string
}) {
  const [artifact] = await db
    .insert(artifacts)
    .values({
      userId: USER_ID,
      conversationId: input.conversationId,
      kind: 'prd',
      title: input.title ?? 'Artifact title',
    })
    .returning({ id: artifacts.id })
  if (!artifact) throw new Error('Artifact fixture was not created')

  const [version] = await db
    .insert(artifactVersions)
    .values({
      artifactId: artifact.id,
      version: 1,
      sourceVersionId: input.sourceVersionId,
      attachmentId: input.attachmentId,
      generationRunId: input.generationId,
      title: input.title ?? 'Artifact title',
      contentSha256: 'a'.repeat(64),
      createdByModelId: 'model-internal',
      createdByRouterModelId: 'router/model',
      changeSummary: 'Created artifact',
    })
    .returning({ id: artifactVersions.id })
  if (!version) throw new Error('Artifact version fixture was not created')

  await db
    .update(artifacts)
    .set({ currentVersionId: version.id })
    .where(eq(artifacts.id, artifact.id))

  return { artifactId: artifact.id, versionId: version.id }
}

async function readBackfillStatements(): Promise<string[]> {
  const migration = await readFile(
    new URL(
      '../../src/lib/db/migrations/0012_artifact_workspace.sql',
      import.meta.url,
    ),
    'utf8',
  )
  const statementStart = migration.indexOf('WITH eligible_generations')
  if (statementStart < 0)
    throw new Error('Artifact backfill statement is missing')
  return migration
    .slice(statementStart)
    .split('--> statement-breakpoint')
    .map((statement) => statement.trim())
    .filter(Boolean)
}

async function runBackfill() {
  for (const statement of await readBackfillStatements()) {
    await db.execute(sql.raw(statement))
  }
}

beforeAll(resetFixture)
afterAll(async () => {
  await db.delete(users).where(eq(users.id, USER_ID))
})

describe.sequential('artifact persistence schema', () => {
  it('enforces immutable version ownership constraints', async () => {
    const conversationId = await createConversation()
    const first = await createGenerationFixture({ conversationId })
    const artifact = await createArtifactWithVersion({
      conversationId,
      generationId: first.generationId,
      attachmentId: first.attachmentId,
    })
    const second = await createGenerationFixture({ conversationId })

    await expect(
      db.insert(artifactVersions).values({
        artifactId: artifact.artifactId,
        version: 1,
        attachmentId: second.attachmentId,
        generationRunId: second.generationId,
        title: 'Duplicate version',
        contentSha256: 'b'.repeat(64),
        createdByModelId: 'model-internal',
        createdByRouterModelId: 'router/model',
        changeSummary: 'Revision',
      }),
    ).rejects.toThrow()

    await expect(
      db.insert(artifactVersions).values({
        artifactId: artifact.artifactId,
        version: 2,
        attachmentId: first.attachmentId,
        generationRunId: second.generationId,
        title: 'Reused attachment',
        contentSha256: 'c'.repeat(64),
        createdByModelId: 'model-internal',
        createdByRouterModelId: 'router/model',
        changeSummary: 'Revision',
      }),
    ).rejects.toThrow()

    await expect(
      db.insert(artifactVersions).values({
        artifactId: artifact.artifactId,
        version: 2,
        attachmentId: second.attachmentId,
        generationRunId: first.generationId,
        title: 'Reused generation',
        contentSha256: 'd'.repeat(64),
        createdByModelId: 'model-internal',
        createdByRouterModelId: 'router/model',
        changeSummary: 'Revision',
      }),
    ).rejects.toThrow()
  })

  it('rejects a current version pointer from another artifact', async () => {
    const conversationId = await createConversation()
    const first = await createGenerationFixture({ conversationId })
    const second = await createGenerationFixture({ conversationId })
    const artifactA = await createArtifactWithVersion({
      conversationId,
      generationId: first.generationId,
      attachmentId: first.attachmentId,
    })
    const artifactB = await createArtifactWithVersion({
      conversationId,
      generationId: second.generationId,
      attachmentId: second.attachmentId,
    })

    await expect(
      db
        .update(artifacts)
        .set({ currentVersionId: artifactB.versionId })
        .where(eq(artifacts.id, artifactA.artifactId)),
    ).rejects.toThrow()
  })

  it('cascades versions when deleting an artifact with a current pointer', async () => {
    const conversationId = await createConversation()
    const fixture = await createGenerationFixture({ conversationId })
    const artifact = await createArtifactWithVersion({
      conversationId,
      generationId: fixture.generationId,
      attachmentId: fixture.attachmentId,
    })

    await db.delete(artifacts).where(eq(artifacts.id, artifact.artifactId))

    const versions = await db
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(eq(artifactVersions.id, artifact.versionId))
    expect(versions).toHaveLength(0)
  })

  it('stores request identity and exact failed revision provenance', async () => {
    const conversationId = await createConversation()
    const sourceFixture = await createGenerationFixture({ conversationId })
    const source = await createArtifactWithVersion({
      conversationId,
      generationId: sourceFixture.generationId,
      attachmentId: sourceFixture.attachmentId,
    })
    const [requestMessage] = await db
      .insert(messages)
      .values({ conversationId, role: 'user', content: 'Revise the artifact' })
      .returning({ id: messages.id })
    const [failedMessage] = await db
      .insert(messages)
      .values({ conversationId, role: 'assistant', content: '' })
      .returning({ id: messages.id })
    if (!requestMessage || !failedMessage) {
      throw new Error('Revision messages were not created')
    }

    const [failedRun] = await db
      .insert(generationRuns)
      .values({
        messageId: failedMessage.id,
        requestMessageId: requestMessage.id,
        conversationId,
        modelId: 'model-internal',
        routerModelId: 'router/model',
        skillId: 'prd-plan',
        status: 'failed',
        sourceArtifactId: source.artifactId,
        sourceVersionId: source.versionId,
      })
      .returning({
        id: generationRuns.id,
        requestMessageId: generationRuns.requestMessageId,
        sourceArtifactId: generationRuns.sourceArtifactId,
        sourceVersionId: generationRuns.sourceVersionId,
      })
    if (!failedRun) throw new Error('Failed generation fixture was not created')
    expect(failedRun).toMatchObject({
      requestMessageId: requestMessage.id,
      sourceArtifactId: source.artifactId,
      sourceVersionId: source.versionId,
    })

    const producedVersions = await db
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(eq(artifactVersions.generationRunId, failedRun.id))
    expect(producedVersions).toHaveLength(0)

    await expect(
      db.insert(generationRuns).values({
        messageId: failedMessage.id,
        requestMessageId: requestMessage.id,
        conversationId,
        modelId: 'model-internal',
        routerModelId: 'router/model',
        skillId: 'prd-plan',
        status: 'failed',
        sourceArtifactId: source.artifactId,
      }),
    ).rejects.toThrow()

    const unrelated = await createGenerationFixture({ conversationId })
    const unrelatedArtifact = await createArtifactWithVersion({
      conversationId,
      generationId: unrelated.generationId,
      attachmentId: unrelated.attachmentId,
    })
    await expect(
      db.insert(generationRuns).values({
        messageId: failedMessage.id,
        requestMessageId: requestMessage.id,
        conversationId,
        modelId: 'model-internal',
        routerModelId: 'router/model',
        skillId: 'prd-plan',
        status: 'failed',
        sourceArtifactId: unrelatedArtifact.artifactId,
        sourceVersionId: source.versionId,
      }),
    ).rejects.toThrow()

    await db.delete(messages).where(eq(messages.id, requestMessage.id))
    const [requestCleared] = await db
      .select({ requestMessageId: generationRuns.requestMessageId })
      .from(generationRuns)
      .where(eq(generationRuns.id, failedRun.id))
    expect(requestCleared?.requestMessageId).toBeNull()
  })

  it('allows cross-artifact provenance during conversation cascade deletion', async () => {
    const conversationId = await createConversation()
    const sourceFixture = await createGenerationFixture({ conversationId })
    const source = await createArtifactWithVersion({
      conversationId,
      generationId: sourceFixture.generationId,
      attachmentId: sourceFixture.attachmentId,
    })
    const forkFixture = await createGenerationFixture({ conversationId })
    const fork = await createArtifactWithVersion({
      conversationId,
      generationId: forkFixture.generationId,
      attachmentId: forkFixture.attachmentId,
      sourceVersionId: source.versionId,
      title: 'Forked artifact',
    })
    const [requestMessage] = await db
      .insert(messages)
      .values({ conversationId, role: 'user', content: 'Fork the artifact' })
      .returning({ id: messages.id })
    const [failedMessage] = await db
      .insert(messages)
      .values({ conversationId, role: 'assistant', content: '' })
      .returning({ id: messages.id })
    if (!requestMessage || !failedMessage) throw new Error('Messages missing')
    await db.insert(generationRuns).values({
      messageId: failedMessage.id,
      requestMessageId: requestMessage.id,
      conversationId,
      modelId: 'model-internal',
      routerModelId: 'router/model',
      skillId: 'prd-plan',
      status: 'failed',
      sourceArtifactId: source.artifactId,
      sourceVersionId: source.versionId,
    })

    await db.delete(conversations).where(eq(conversations.id, conversationId))

    const remainingVersions = await db
      .select({ id: artifactVersions.id })
      .from(artifactVersions)
      .where(inArray(artifactVersions.id, [source.versionId, fork.versionId]))
    expect(remainingVersions).toHaveLength(0)
  })

  it('backfills only unambiguous legacy Markdown once', async () => {
    const conversationId = await createConversation()
    const eligible = await createGenerationFixture({
      conversationId,
      fileName: 'legacy-prd.md',
    })
    const ambiguousGenerations = await createGenerationFixture({
      conversationId,
      fileName: 'ambiguous-generation.md',
    })
    await db.insert(generationRuns).values({
      messageId: ambiguousGenerations.messageId,
      conversationId,
      modelId: 'second-model',
      routerModelId: 'router/second-model',
      skillId: 'prd-plan',
      status: 'completed',
    })
    const ambiguousAttachments = await createGenerationFixture({
      conversationId,
      fileName: 'ambiguous-attachment-a.md',
    })
    await db.insert(attachments).values({
      userId: USER_ID,
      messageId: ambiguousAttachments.messageId,
      conversationId,
      fileName: 'ambiguous-attachment-b.md',
      fileSize: 64,
      mimeType: 'text/markdown',
      r2Key: `artifact-schema/${crypto.randomUUID()}/ambiguous-attachment-b.md`,
      r2Bucket: 'artifact-schema-fixture',
      processingStatus: 'completed',
    })
    const checklist = await createGenerationFixture({
      conversationId,
      skillId: 'checklist',
      fileName: 'legacy-checklist.json',
      mimeType: 'application/json',
    })

    await runBackfill()

    const [eligibleVersion] = await db
      .select({
        versionId: artifactVersions.id,
        artifactId: artifactVersions.artifactId,
        attachmentId: artifactVersions.attachmentId,
        generationRunId: artifactVersions.generationRunId,
        title: artifactVersions.title,
        contentSha256: artifactVersions.contentSha256,
        currentVersionId: artifacts.currentVersionId,
        kind: artifacts.kind,
      })
      .from(artifactVersions)
      .innerJoin(artifacts, eq(artifacts.id, artifactVersions.artifactId))
      .where(eq(artifactVersions.generationRunId, eligible.generationId))
    expect(eligibleVersion).toMatchObject({
      attachmentId: eligible.attachmentId,
      generationRunId: eligible.generationId,
      title: 'legacy-prd.md',
      contentSha256: null,
      kind: 'prd',
    })
    expect(eligibleVersion?.currentVersionId).toBe(eligibleVersion?.versionId)

    const excludedGenerationIds = [
      ambiguousGenerations.generationId,
      ambiguousAttachments.generationId,
      checklist.generationId,
    ]
    const excludedVersions = await db
      .select({ generationRunId: artifactVersions.generationRunId })
      .from(artifactVersions)
      .where(inArray(artifactVersions.generationRunId, excludedGenerationIds))
    expect(excludedVersions).toHaveLength(0)

    const [beforeRerun] = await db
      .select({ value: count() })
      .from(artifactVersions)
      .where(
        and(
          eq(artifactVersions.attachmentId, eligible.attachmentId),
          eq(artifactVersions.generationRunId, eligible.generationId),
        ),
      )
    await runBackfill()
    const [afterRerun] = await db
      .select({ value: count() })
      .from(artifactVersions)
      .where(
        and(
          eq(artifactVersions.attachmentId, eligible.attachmentId),
          eq(artifactVersions.generationRunId, eligible.generationId),
        ),
      )
    expect(beforeRerun?.value).toBe(1)
    expect(afterRerun?.value).toBe(1)
  })
})
