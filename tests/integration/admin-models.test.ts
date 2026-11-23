/**
 * @vitest-environment node
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../src/lib/db/schema'
import { AppError } from '../../src/lib/utils/errors'

const connectionString = process.env.ZONA_P1_TEST_DATABASE_URL ?? ''
const describeDb = connectionString ? describe : describe.skip

const session = (role: 'user' | 'admin') => ({
  session: {
    id: `sess-${role}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    userId: `user-${role}`,
    expiresAt: new Date(Date.now() + 86_400_000),
    token: `tok-${role}`,
  },
  user: {
    id: `user-${role}`,
    email: `${role}@example.com`,
    name: role,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    role,
    banned: false,
  },
})
const databaseName = 'zona_p1_admin_test'

const rootConnectionString = () => {
  const url = new URL(connectionString)
  url.pathname = '/postgres'
  return url.toString()
}

const isolatedConnectionString = () => {
  const url = new URL(connectionString)
  url.pathname = `/${databaseName}`
  return url.toString()
}

describeDb('Admin model availability on isolated PostgreSQL', () => {
  let sql: Sql
  let database: ReturnType<typeof drizzle<typeof schema>>
  let auth: typeof import('../../src/lib/auth/auth')
  let adminModels: typeof import('../../src/server/core/admin-models')
  let catalog: typeof import('../../src/server/core/model-catalog')
  let compareCore: typeof import('../../src/server/core/compare')
  let functionsModule: typeof import('../../src/server/functions/admin-models')

  beforeAll(async () => {
    const root = postgres(rootConnectionString(), { max: 1 })
    try {
      await root`DROP DATABASE IF EXISTS zona_p1_admin_test WITH (FORCE)`
      await root`CREATE DATABASE zona_p1_admin_test`
    } finally {
      await root.end()
    }
    process.env.DATABASE_URL = isolatedConnectionString().replace(
      /^postgres:\/\//,
      'postgresql://',
    )
    sql = postgres(isolatedConnectionString(), { max: 1 })
    database = drizzle(sql, { schema })
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'src/lib/db/migrations'),
    })

    auth = await import('../../src/lib/auth/auth')
    adminModels = await import('../../src/server/core/admin-models')
    catalog = await import('../../src/server/core/model-catalog')
    compareCore = await import('../../src/server/core/compare')
    functionsModule = await import('../../src/server/functions/admin-models')
  }, 30_000)

  beforeEach(async () => {
    await sql`TRUNCATE audit_logs, model_aliases, model_catalog, model_settings CASCADE`
    await catalog.seedModelCatalogFromLegacy(database)
    await database
      .insert(schema.users)
      .values([
        {
          id: 'user-admin',
          email: 'admin@example.com',
          name: 'admin',
          role: 'admin',
        },
        {
          id: 'user-user',
          email: 'user@example.com',
          name: 'user',
          role: 'user',
        },
      ])
      .onConflictDoNothing()
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await sql?.end()
    const root = postgres(rootConnectionString(), { max: 1 })
    try {
      await root`DROP DATABASE IF EXISTS zona_p1_admin_test WITH (FORCE)`
    } finally {
      await root.end()
    }
  })

  it('reports catalog status from the database, not a process cache', async () => {
    expect((await catalog.getEligibleModel('cx/gpt-5.6-terra'))?.id).toBe(
      'cx/gpt-5.6-terra',
    )

    await database
      .update(schema.modelSettings)
      .set({ isActive: false, status: 'inactive', disabledReason: 'Maintenance' })
      .where(eq(schema.modelSettings.modelId, 'cx/gpt-5.6-terra'))
    catalog.invalidateCatalogCache()

    expect(await catalog.getEligibleModel('cx/gpt-5.6-terra')).toBeNull()
    expect(await catalog.getEligibleModel('gpt-5.6-terra')).toBeNull()
    expect(
      (await catalog.getPublicCatalog()).find(
        (entry) => entry.id === 'cx/gpt-5.6-terra',
      )?.disabledReason,
    ).toBe('Maintenance')
  })

  it('rejects non-admin updates before touching the catalog', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValueOnce(
      session('user'),
    )
    const request = new Request('http://localhost:3000/api/admin/models')

    await expect(
      adminModels.updateModelAvailabilityCore({
        modelId: 'cx/gpt-5.6-terra',
        isActive: false,
        request,
      }),
    ).rejects.toBeInstanceOf(AppError)

    expect(await catalog.getEligibleModel('cx/gpt-5.6-terra')).not.toBeNull()
  })

  it('persists admin disable/enable with audit rows and invalidates the catalog', async () => {
    const request = new Request('http://localhost:3000/api/admin/models')
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))

    const disabled = await adminModels.updateModelAvailabilityCore({
      modelId: 'cx/gpt-5.6-terra',
      isActive: false,
      disabledReason: 'Emergency maintenance',
      request,
    })
    expect(disabled).toMatchObject({
      success: true,
      modelId: 'cx/gpt-5.6-terra',
      isActive: false,
    })
    expect(await catalog.getEligibleModel('cx/gpt-5.6-terra')).toBeNull()

    const auditRows = await database.select().from(schema.auditLogs)
    expect(auditRows).toMatchObject([
      {
        adminId: 'user-admin',
        action: 'model.disable',
        targetId: 'cx/gpt-5.6-terra',
        targetType: 'model',
      },
    ])

    const enabled = await adminModels.updateModelAvailabilityCore({
      modelId: 'cx/gpt-5.6-sol',
      isActive: true,
      request,
    })
    expect(enabled.isActive).toBe(true)
    expect(await catalog.getEligibleModel('gpt-5.6-sol')).not.toBeNull()
  })

  it('fails Compare validation when an admin-disabled model is selected', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    const request = new Request('http://localhost:3000/api/admin/models')
    await adminModels.updateModelAvailabilityCore({
      modelId: 'cx/gpt-5.6-sol',
      isActive: false,
      disabledReason: 'Maintenance',
      request,
    })

    await expect(
      compareCore.validateCompareModelsAvailability([
        'ag/gemini-3.7-flash-high',
        'cx/gpt-5.6-sol',
      ]),
    ).rejects.toMatchObject({ code: 'ERR-MODEL-DISABLED' })
  })

  it('validates the admin update schema at the server boundary', () => {
    const valid = functionsModule.updateModelAvailabilitySchema.safeParse({
      modelId: 'cx/gpt-5.6-sol',
      isActive: false,
      disabledReason: 'Upgrading cluster',
    })
    expect(valid.success).toBe(true)

    const invalid = functionsModule.updateModelAvailabilitySchema.safeParse({
      modelId: '',
      isActive: 'not-a-boolean',
    })
    expect(invalid.success).toBe(false)
  })

  it('migration 0019 preserves legacy data and backfills admin status', async () => {
    await sql`DROP TABLE IF EXISTS model_aliases CASCADE`
    await sql`DROP TABLE IF EXISTS model_catalog CASCADE`
    await sql`ALTER TABLE model_settings DROP COLUMN IF EXISTS status CASCADE`
    await sql`ALTER TABLE model_settings DROP COLUMN IF EXISTS retired_at`
    await sql`ALTER TABLE model_settings DROP COLUMN IF EXISTS last_checked_at`

    await sql`UPDATE users SET credits = 777 WHERE id = 'user-admin'`
    await sql`UPDATE model_settings SET is_active = false, disabled_reason = 'legacy maintenance', updated_by = 'user-admin' WHERE model_id = 'cx/gpt-5.6-terra'`
    const [conversation] = await sql<{ id: string }>`INSERT INTO conversations (user_id, title, model_id) VALUES ('user-admin', 'Legacy chat', 'cx/gpt-5.6-terra') RETURNING id`
    await sql`INSERT INTO messages (conversation_id, role, content) VALUES (${conversation?.id}, 'user', 'legacy message')`
    await sql`INSERT INTO artifacts (user_id, conversation_id, kind, title) VALUES ('user-admin', ${conversation?.id}, 'prd', 'Legacy artifact')`
    await sql`INSERT INTO credit_transactions (user_id, amount, type, model_id, balance_after) VALUES ('user-admin', -15, 'generation', 'cx/gpt-5.6-terra', 777)`
    await sql`INSERT INTO audit_logs (admin_id, admin_email, action, target_id, target_type) VALUES ('user-admin', 'admin@example.com', 'model.disable', 'cx/gpt-5.6-terra', 'model')`

    const migration = readFileSync(
      path.resolve(process.cwd(), 'src/lib/db/migrations/0019_model_catalog.sql'),
      'utf8',
    )
    await sql.unsafe(migration.replaceAll('--> statement-breakpoint', ''))

    const [user] = await sql<{ credits: number }>`SELECT credits FROM users WHERE id = 'user-admin'`
    const [storedConversation] = await sql<{ title: string }>`SELECT title FROM conversations WHERE id = ${conversation?.id}`
    const [messageCount] = await sql<{ value: number }>`SELECT count(*)::int AS value FROM messages`
    const [artifactCount] = await sql<{ value: number }>`SELECT count(*)::int AS value FROM artifacts`
    const [creditCount] = await sql<{ value: number }>`SELECT count(*)::int AS value FROM credit_transactions`
    const [auditCount] = await sql<{ value: number }>`SELECT count(*)::int AS value FROM audit_logs`
    const [setting] = await sql<{
      status: string
      disabled_reason: string | null
    }>`SELECT status, disabled_reason FROM model_settings WHERE model_id = 'cx/gpt-5.6-terra'`

    expect(user?.credits).toBe(777)
    expect(storedConversation?.title).toBe('Legacy chat')
    expect(messageCount?.value).toBe(1)
    expect(artifactCount?.value).toBe(1)
    expect(creditCount?.value).toBe(1)
    expect(auditCount?.value).toBe(1)
    expect(setting).toMatchObject({
      status: 'inactive',
      disabled_reason: 'legacy maintenance',
    })

    expect(await catalog.seedModelCatalogFromLegacy(database)).toEqual({
      catalogRows: 26,
      aliasRows: 2,
    })
    expect(await catalog.seedModelCatalogFromLegacy(database)).toEqual({
      catalogRows: 26,
      aliasRows: 2,
    })
    expect(await catalog.getEligibleModel('cx/gpt-5.6-terra', database)).toBeNull()
  })
})
