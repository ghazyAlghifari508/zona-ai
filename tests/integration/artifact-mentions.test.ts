/**
 * @vitest-environment node
 */

import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../src/lib/db'
import {
  artifacts,
  artifactVersions,
  attachments,
  conversations,
  generationRuns,
  messageArtifactMentions,
  messages,
  users,
} from '../../src/lib/db/schema'

const USER_ID = 'artifact-mention-schema-owner'
const USER_EMAIL = 'artifact-mention-schema-owner@example.com'

function constraintName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  if ('constraint_name' in error && typeof error.constraint_name === 'string') {
    return error.constraint_name
  }
  return 'cause' in error ? constraintName(error.cause) : null
}

async function captureConstraint(operation: Promise<unknown>) {
  try {
    await operation
    return null
  } catch (error) {
    return constraintName(error)
  }
}

async function resetOwner() {
  await db.delete(users).where(eq(users.id, USER_ID))
  await db.insert(users).values({
    id: USER_ID,
    email: USER_EMAIL,
    name: 'Artifact mention schema owner',
  })
}

async function createConversation() {
  const [conversation] = await db
    .insert(conversations)
    .values({ userId: USER_ID, title: 'Mention schema fixture' })
    .returning({ id: conversations.id })
  if (!conversation) throw new Error('Conversation fixture was not created')
  return conversation.id
}

async function createUserMessage(conversationId: string) {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      role: 'user',
      content: 'Synthetic mention fixture',
    })
    .returning({ id: messages.id })
  if (!message) throw new Error('Message fixture was not created')
  return message.id
}

async function createArtifactFixture(conversationId: string, label: string) {
  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      role: 'assistant',
      content: 'Synthetic artifact fixture',
    })
    .returning({ id: messages.id })
  if (!message) throw new Error('Artifact message fixture was not created')

  const [generation] = await db
    .insert(generationRuns)
    .values({
      messageId: message.id,
      conversationId,
      modelId: 'model-internal',
      routerModelId: 'router/model',
      skillId: 'prd-plan',
      status: 'completed',
    })
    .returning({ id: generationRuns.id })
  if (!generation) throw new Error('Generation fixture was not created')

  const [attachment] = await db
    .insert(attachments)
    .values({
      userId: USER_ID,
      messageId: message.id,
      conversationId,
      fileName: `${label}.md`,
      fileSize: 64,
      mimeType: 'text/markdown',
      r2Key: `artifact-mention/${label}-${crypto.randomUUID()}.md`,
      r2Bucket: 'artifact-mention-fixture',
      processingStatus: 'completed',
    })
    .returning({ id: attachments.id })
  if (!attachment) throw new Error('Attachment fixture was not created')

  const [artifact] = await db
    .insert(artifacts)
    .values({
      userId: USER_ID,
      conversationId,
      kind: 'prd',
      title: `Mention ${label}`,
    })
    .returning({ id: artifacts.id })
  if (!artifact) throw new Error('Artifact fixture was not created')

  const [version] = await db
    .insert(artifactVersions)
    .values({
      artifactId: artifact.id,
      conversationId,
      version: 1,
      attachmentId: attachment.id,
      generationRunId: generation.id,
      title: `Mention ${label}`,
      changeSummary: 'Synthetic mention fixture',
      createdByModelId: 'model-internal',
      createdByRouterModelId: 'router/model',
    })
    .returning({ id: artifactVersions.id })
  if (!version) throw new Error('Artifact version fixture was not created')

  await db
    .update(artifacts)
    .set({ currentVersionId: version.id })
    .where(eq(artifacts.id, artifact.id))

  return { artifactId: artifact.id, versionId: version.id }
}

describe('message_artifact_mentions persistence', () => {
  beforeAll(async () => {
    await resetOwner()
  })

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID))
  })

  it('persists ordered server snapshots for one message', async () => {
    const conversationId = await createConversation()
    const messageId = await createUserMessage(conversationId)
    const first = await createArtifactFixture(conversationId, 'alpha')
    const second = await createArtifactFixture(conversationId, 'beta')

    await db.insert(messageArtifactMentions).values([
      {
        messageId,
        conversationId,
        artifactId: first.artifactId,
        versionId: first.versionId,
        mode: 'context',
        position: 0,
        titleSnapshot: 'Mention alpha',
        kindSnapshot: 'prd',
        versionSnapshot: 1,
      },
      {
        messageId,
        conversationId,
        artifactId: second.artifactId,
        versionId: second.versionId,
        mode: 'revise',
        position: 1,
        titleSnapshot: 'Mention beta',
        kindSnapshot: 'prd',
        versionSnapshot: 1,
      },
    ])

    const rows = await db
      .select()
      .from(messageArtifactMentions)
      .where(eq(messageArtifactMentions.messageId, messageId))
    expect(rows).toHaveLength(2)
    const modes = rows.map((row) => row.mode).sort()
    expect(modes).toEqual(['context', 'revise'])
  })

  it('rejects the same artifact twice in one message', async () => {
    const conversationId = await createConversation()
    const messageId = await createUserMessage(conversationId)
    const target = await createArtifactFixture(conversationId, 'dupe')

    await db.insert(messageArtifactMentions).values({
      messageId,
      conversationId,
      artifactId: target.artifactId,
      versionId: target.versionId,
      mode: 'context',
      position: 0,
      titleSnapshot: 'Mention dupe',
      kindSnapshot: 'prd',
      versionSnapshot: 1,
    })

    const violation = await captureConstraint(
      db.insert(messageArtifactMentions).values({
        messageId,
        conversationId,
        artifactId: target.artifactId,
        versionId: target.versionId,
        mode: 'context',
        position: 1,
        titleSnapshot: 'Mention dupe',
        kindSnapshot: 'prd',
        versionSnapshot: 1,
      }),
    )
    expect(violation).not.toBeNull()
  })

  it('rejects duplicate positions within one message', async () => {
    const conversationId = await createConversation()
    const messageId = await createUserMessage(conversationId)
    const first = await createArtifactFixture(conversationId, 'pos-a')
    const second = await createArtifactFixture(conversationId, 'pos-b')

    await db.insert(messageArtifactMentions).values({
      messageId,
      conversationId,
      artifactId: first.artifactId,
      versionId: first.versionId,
      mode: 'context',
      position: 0,
      titleSnapshot: 'Mention pos-a',
      kindSnapshot: 'prd',
      versionSnapshot: 1,
    })

    const violation = await captureConstraint(
      db.insert(messageArtifactMentions).values({
        messageId,
        conversationId,
        artifactId: second.artifactId,
        versionId: second.versionId,
        mode: 'context',
        position: 0,
        titleSnapshot: 'Mention pos-b',
        kindSnapshot: 'prd',
        versionSnapshot: 1,
      }),
    )
    expect(violation).not.toBeNull()
  })

  it('rejects negative positions and unknown modes', async () => {
    const conversationId = await createConversation()
    const messageId = await createUserMessage(conversationId)
    const target = await createArtifactFixture(conversationId, 'bounds')

    const negativePosition = await captureConstraint(
      db.insert(messageArtifactMentions).values({
        messageId,
        conversationId,
        artifactId: target.artifactId,
        versionId: target.versionId,
        mode: 'context',
        position: -1,
        titleSnapshot: 'Mention bounds',
        kindSnapshot: 'prd',
        versionSnapshot: 1,
      }),
    )
    expect(negativePosition).not.toBeNull()

    const other = await createArtifactFixture(conversationId, 'mode-x')
    const unknownMode = await captureConstraint(
      db.insert(messageArtifactMentions).values({
        messageId,
        conversationId,
        artifactId: other.artifactId,
        versionId: other.versionId,
        mode: 'delete',
        position: 0,
        titleSnapshot: 'Mention mode-x',
        kindSnapshot: 'prd',
        versionSnapshot: 1,
      }),
    )
    expect(unknownMode).not.toBeNull()
  })

  it('rejects a version from another artifact', async () => {
    const conversationId = await createConversation()
    const messageId = await createUserMessage(conversationId)
    const first = await createArtifactFixture(conversationId, 'scope-a')
    const second = await createArtifactFixture(conversationId, 'scope-b')

    const violation = await captureConstraint(
      db.insert(messageArtifactMentions).values({
        messageId,
        conversationId,
        artifactId: first.artifactId,
        versionId: second.versionId,
        mode: 'context',
        position: 0,
        titleSnapshot: 'Mention scope-a',
        kindSnapshot: 'prd',
        versionSnapshot: 1,
      }),
    )
    expect(violation).not.toBeNull()
  })

  it('cascades mentions when the user message is deleted', async () => {
    const conversationId = await createConversation()
    const messageId = await createUserMessage(conversationId)
    const target = await createArtifactFixture(conversationId, 'cascade')

    await db.insert(messageArtifactMentions).values({
      messageId,
      conversationId,
      artifactId: target.artifactId,
      versionId: target.versionId,
      mode: 'context',
      position: 0,
      titleSnapshot: 'Mention cascade',
      kindSnapshot: 'prd',
      versionSnapshot: 1,
    })
    await db.delete(messages).where(eq(messages.id, messageId))

    const rows = await db
      .select()
      .from(messageArtifactMentions)
      .where(eq(messageArtifactMentions.messageId, messageId))
    expect(rows).toHaveLength(0)
  })
})
