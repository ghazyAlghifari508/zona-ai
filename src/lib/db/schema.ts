import { sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  type PgTableExtraConfigValue,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  vector,
} from 'drizzle-orm/pg-core'
import { ARTIFACT_KINDS, type ArtifactKind } from '../artifacts/contracts'
import type { ArtifactMentionMode } from '../artifacts/mentions'
import {
  ARTIFACT_TITLE_MAX_LENGTH,
  EMBEDDING_DIMENSION,
} from '../utils/constants'

const artifactKindSql = sql.join(
  ARTIFACT_KINDS.map((kind) => sql.raw(`'${kind}'`)),
  sql`, `,
)
const artifactTitleMaxLengthSql = sql.raw(String(ARTIFACT_TITLE_MAX_LENGTH))

// users — Better Auth managed + credits
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    name: text('name'),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false),
    image: text('image'),
    credits: integer('credits').notNull().default(100),
    role: text('role').notNull().default('user'),
    banned: boolean('banned').notNull().default(false),
    banReason: text('ban_reason'),
    banExpires: timestamp('ban_expires', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('users_role_idx').on(table.role),
    index('users_banned_idx').on(table.banned),
  ],
)

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    issuer: text('issuer'),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
    }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('accounts_user_id_idx').on(table.userId),
    unique('accounts_provider_account_unique').on(
      table.providerId,
      table.accountId,
    ),
  ],
)

export const verifications = pgTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    mode: text('mode').notNull().default('normal'),
    modelId: text('model_id'),
    deletionStartedAt: timestamp('deletion_started_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('conversations_user_id_idx').on(table.userId),
    index('conversations_created_at_idx').on(table.createdAt),
    unique('conversations_id_user_id_unique').on(table.id, table.userId),
    index('conversations_user_updated_id_idx').on(
      table.userId,
      table.updatedAt.desc(),
      table.id,
    ),
  ],
)

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    unique('messages_id_conversation_id_unique').on(
      table.id,
      table.conversationId,
    ),
    index('messages_conversation_id_created_at_idx').on(
      table.conversationId,
      table.createdAt,
    ),
  ],
)

export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type').notNull(),
    r2Key: text('r2_key').notNull().unique(),
    r2Bucket: text('r2_bucket').notNull(),
    processingStatus: text('processing_status').notNull().default('pending'),
    extractedText: text('extracted_text'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('attachments_user_id_idx').on(table.userId),
    index('attachments_conversation_id_idx').on(table.conversationId),
    index('attachments_message_id_idx').on(table.messageId),
    index('attachments_r2_key_idx').on(table.r2Key),
    unique('attachments_id_conversation_id_unique').on(
      table.id,
      table.conversationId,
    ),
    foreignKey({
      name: 'attachments_conversation_owner_fk',
      columns: [table.conversationId, table.userId],
      foreignColumns: [conversations.id, conversations.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'attachments_message_scope_fk',
      columns: [table.messageId, table.conversationId],
      foreignColumns: [messages.id, messages.conversationId],
    }),
  ],
)

export const comparisonRuns = pgTable(
  'comparison_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userMessageId: uuid('user_message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    status: text('status').notNull(),
    modelIds: text('model_ids').array().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('comparison_runs_conversation_id_idx').on(table.conversationId),
  ],
)

export const generationRuns = pgTable(
  'generation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    requestMessageId: uuid('request_message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    comparisonRunId: uuid('comparison_run_id').references(
      () => comparisonRuns.id,
      { onDelete: 'set null' },
    ),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    sourceArtifactId: uuid('source_artifact_id'),
    sourceVersionId: uuid('source_version_id'),
    modelId: text('model_id').notNull(),
    routerModelId: text('router_model_id').notNull(),
    skillId: text('skill_id'),
    status: text('status').notNull(),
    content: text('content'),
    reasoningContent: text('reasoning_content'),
    error: jsonb('error').$type<{ message: string; code?: string } | null>(),
    promptTokens: integer('prompt_tokens'),
    completionTokens: integer('completion_tokens'),
    totalTokens: integer('total_tokens'),
    latencyMs: integer('latency_ms'),
    timeToFirstTokenMs: integer('time_to_first_token_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table): PgTableExtraConfigValue[] => [
    index('generation_runs_conversation_id_idx').on(table.conversationId),
    index('generation_runs_comparison_run_id_idx').on(table.comparisonRunId),
    index('generation_runs_message_id_idx').on(table.messageId),
    index('generation_runs_request_message_id_idx').on(table.requestMessageId),
    index('generation_runs_source_version_idx').on(
      table.sourceVersionId,
      table.sourceArtifactId,
    ),
    index('generation_runs_status_idx').on(table.status),
    unique('generation_runs_id_conversation_id_unique').on(
      table.id,
      table.conversationId,
    ),
    foreignKey({
      name: 'generation_runs_message_scope_fk',
      columns: [table.messageId, table.conversationId],
      foreignColumns: [messages.id, messages.conversationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'generation_runs_request_message_scope_fk',
      columns: [table.requestMessageId, table.conversationId],
      foreignColumns: [messages.id, messages.conversationId],
    }),
    foreignKey({
      name: 'generation_runs_source_conversation_scope_fk',
      columns: [
        table.sourceVersionId,
        table.sourceArtifactId,
        table.conversationId,
      ],
      foreignColumns: [
        artifactVersions.id,
        artifactVersions.artifactId,
        artifactVersions.conversationId,
      ],
    }).onDelete('restrict'),
    check(
      'generation_runs_source_identity_check',
      sql`(${table.sourceArtifactId} IS NULL AND ${table.sourceVersionId} IS NULL) OR (${table.sourceArtifactId} IS NOT NULL AND ${table.sourceVersionId} IS NOT NULL)`,
    ),
  ],
)

export const artifactVersions = pgTable(
  'artifact_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references((): AnyPgColumn => artifacts.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    version: integer('version').notNull(),
    sourceVersionId: uuid('source_version_id').references(
      (): AnyPgColumn => artifactVersions.id,
      { onDelete: 'restrict' },
    ),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    generationRunId: uuid('generation_run_id')
      .notNull()
      .references((): AnyPgColumn => generationRuns.id, {
        onDelete: 'cascade',
      }),
    title: text('title').notNull(),
    contentSha256: text('content_sha256'),
    createdByModelId: text('created_by_model_id').notNull(),
    createdByRouterModelId: text('created_by_router_model_id').notNull(),
    changeSummary: text('change_summary').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table): PgTableExtraConfigValue[] => [
    uniqueIndex('artifact_versions_artifact_id_version_unique').on(
      table.artifactId,
      table.version.desc(),
    ),
    unique('artifact_versions_id_artifact_id_unique').on(
      table.id,
      table.artifactId,
    ),
    unique('artifact_versions_id_conversation_id_unique').on(
      table.id,
      table.conversationId,
    ),
    unique('artifact_versions_id_artifact_id_conversation_id_unique').on(
      table.id,
      table.artifactId,
      table.conversationId,
    ),
    uniqueIndex('artifact_versions_attachment_id_unique').on(
      table.attachmentId,
    ),
    uniqueIndex('artifact_versions_generation_run_id_unique').on(
      table.generationRunId,
    ),
    index('artifact_versions_source_version_id_idx').on(table.sourceVersionId),
    foreignKey({
      name: 'artifact_versions_artifact_scope_fk',
      columns: [table.artifactId, table.conversationId],
      foreignColumns: [artifacts.id, artifacts.conversationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'artifact_versions_source_scope_fk',
      columns: [table.sourceVersionId, table.conversationId],
      foreignColumns: [artifactVersions.id, artifactVersions.conversationId],
    }).onDelete('restrict'),
    foreignKey({
      name: 'artifact_versions_attachment_scope_fk',
      columns: [table.attachmentId, table.conversationId],
      foreignColumns: [attachments.id, attachments.conversationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'artifact_versions_generation_scope_fk',
      columns: [table.generationRunId, table.conversationId],
      foreignColumns: [generationRuns.id, generationRuns.conversationId],
    }).onDelete('cascade'),
    check(
      'artifact_versions_version_positive_check',
      sql`${table.version} > 0`,
    ),
    check(
      'artifact_versions_title_length_check',
      sql`char_length(${table.title}) <= ${artifactTitleMaxLengthSql}`,
    ),
  ],
)

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ArtifactKind>().notNull(),
    title: text('title').notNull(),
    currentVersionId: uuid('current_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table): PgTableExtraConfigValue[] => [
    index('artifacts_user_id_conversation_id_idx').on(
      table.userId,
      table.conversationId,
    ),
    index('artifacts_conversation_id_updated_at_idx').on(
      table.conversationId,
      table.updatedAt.desc(),
    ),
    index('artifacts_conversation_id_kind_idx').on(
      table.conversationId,
      table.kind,
    ),
    unique('artifacts_id_conversation_id_unique').on(
      table.id,
      table.conversationId,
    ),
    foreignKey({
      name: 'artifacts_conversation_owner_fk',
      columns: [table.conversationId, table.userId],
      foreignColumns: [conversations.id, conversations.userId],
    }).onDelete('cascade'),
    check('artifacts_kind_check', sql`${table.kind} IN (${artifactKindSql})`),
    check(
      'artifacts_title_length_check',
      sql`char_length(${table.title}) <= ${artifactTitleMaxLengthSql}`,
    ),
    foreignKey({
      name: 'artifacts_current_version_scope_fk',
      columns: [table.currentVersionId, table.id],
      foreignColumns: [artifactVersions.id, artifactVersions.artifactId],
    }).onDelete('restrict'),
  ],
)

export const messageArtifactMentions = pgTable(
  'message_artifact_mentions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').notNull(),
    artifactId: uuid('artifact_id').notNull(),
    versionId: uuid('version_id').notNull(),
    mode: text('mode').$type<ArtifactMentionMode>().notNull(),
    position: integer('position').notNull(),
    titleSnapshot: text('title_snapshot').notNull(),
    kindSnapshot: text('kind_snapshot').$type<ArtifactKind>().notNull(),
    versionSnapshot: integer('version_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex('message_artifact_mentions_message_artifact_unique').on(
      table.messageId,
      table.artifactId,
    ),
    uniqueIndex('message_artifact_mentions_message_position_unique').on(
      table.messageId,
      table.position,
    ),
    index('message_artifact_mentions_message_id_idx').on(table.messageId),
    index('message_artifact_mentions_artifact_id_idx').on(table.artifactId),
    index('message_artifact_mentions_version_id_idx').on(table.versionId),
    foreignKey({
      name: 'message_artifact_mentions_message_scope_fk',
      columns: [table.messageId, table.conversationId],
      foreignColumns: [messages.id, messages.conversationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'message_artifact_mentions_artifact_version_scope_fk',
      columns: [table.versionId, table.artifactId, table.conversationId],
      foreignColumns: [
        artifactVersions.id,
        artifactVersions.artifactId,
        artifactVersions.conversationId,
      ],
    }).onDelete('cascade'),
    check(
      'message_artifact_mentions_mode_check',
      sql`${table.mode} IN ('context', 'revise')`,
    ),
    check(
      'message_artifact_mentions_position_nonnegative_check',
      sql`${table.position} >= 0`,
    ),
  ],
)

export const creditTransactions = pgTable(
  'credit_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    generationRunId: uuid('generation_run_id').references(
      () => generationRuns.id,
      {
        onDelete: 'set null',
      },
    ),
    amount: integer('amount').notNull(),
    type: text('type').notNull(),
    modelId: text('model_id'),
    balanceAfter: integer('balance_after').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('credit_transactions_user_id_idx').on(table.userId),
    index('credit_transactions_generation_run_id_idx').on(
      table.generationRunId,
    ),
    index('credit_transactions_created_at_idx').on(table.createdAt),
    unique('credit_transactions_generation_type_unique').on(
      table.generationRunId,
      table.type,
    ),
  ],
)

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    planId: text('plan_id').notNull(),
    billingPeriod: text('billing_period').notNull(),
    amountIdr: integer('amount_idr').notNull(),
    creditsGranted: integer('credits_granted').notNull(),
    status: text('status').notNull().default('creating'),
    orderId: text('order_id').notNull().unique(),
    snapToken: text('snap_token'),
    midtransTransactionId: text('midtrans_transaction_id'),
    paymentType: text('payment_type'),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('payments_user_id_idx').on(table.userId),
    index('payments_status_idx').on(table.status),
  ],
)

export const usageRecords = pgTable(
  'usage_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    generationRunId: uuid('generation_run_id')
      .notNull()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    modelId: text('model_id').notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('usage_records_user_id_created_at_idx').on(
      table.userId,
      table.createdAt,
    ),
  ],
)

export const documentChunks = pgTable(
  'document_chunks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attachmentId: uuid('attachment_id')
      .notNull()
      .references(() => attachments.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSION }),
    metadata: jsonb('metadata').$type<{
      startOffset: number
      endOffset: number
    } | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('document_chunks_attachment_id_idx').on(table.attachmentId),
    index('document_chunks_conversation_id_idx').on(table.conversationId),
  ],
)

export const webSources = pgTable(
  'web_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    generationRunId: uuid('generation_run_id')
      .notNull()
      .references(() => generationRuns.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    title: text('title'),
    snippet: text('snippet'),
    score: real('score'),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('web_sources_generation_run_id_idx').on(table.generationRunId),
    index('web_sources_conversation_id_idx').on(table.conversationId),
    index('web_sources_generation_run_id_position_idx').on(
      table.generationRunId,
      table.position,
    ),
  ],
)

export const modelSettings = pgTable('model_settings', {
  modelId: text('model_id').primaryKey(),
  isActive: boolean('is_active').notNull().default(true),
  disabledReason: text('disabled_reason'),
  updatedBy: text('updated_by').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

export const feedback = pgTable(
  'feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    stepsToReproduce: text('steps_to_reproduce'),
    expectedBehavior: text('expected_behavior'),
    actualBehavior: text('actual_behavior'),
    attachmentR2Key: text('attachment_r2_key'),
    attachmentFileName: text('attachment_file_name'),
    attachmentMimeType: text('attachment_mime_type'),
    attachmentFileSize: integer('attachment_file_size'),
    status: text('status').notNull().default('new'),
    adminNotes: text('admin_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('feedback_user_id_idx').on(table.userId),
    index('feedback_status_idx').on(table.status),
    index('feedback_type_idx').on(table.type),
    index('feedback_created_at_idx').on(table.createdAt.desc()),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminId: text('admin_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    adminEmail: text('admin_email').notNull(),
    action: text('action').notNull(),
    targetId: text('target_id').notNull(),
    targetType: text('target_type').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index('audit_logs_admin_id_idx').on(table.adminId),
    index('audit_logs_action_idx').on(table.action),
    index('audit_logs_target_idx').on(table.targetType, table.targetId),
    index('audit_logs_created_at_idx').on(table.createdAt.desc()),
  ],
)
