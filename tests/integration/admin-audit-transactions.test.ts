/**
 * @vitest-environment node
 */
import path from 'node:path'
import { eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { type Sql } from 'postgres'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import * as auditMetadata from '../../src/lib/admin/audit-metadata'
import type { auth as AuthModule } from '../../src/lib/auth/auth'
import * as schema from '../../src/lib/db/schema'
import type { retireAdminModelCore as RetireAdminModelCore } from '../../src/server/core/admin-models'
import type { deleteUserCore as DeleteUserCore } from '../../src/server/core/admin-users'
import type { resetDevCreditsCore as ResetDevCreditsCore } from '../../src/server/core/credits'
import type { updateFeedbackStatusCore as UpdateFeedbackStatusCore } from '../../src/server/core/feedback'

const connectionString = process.env.ZONA_P6_TEST_DATABASE_URL ?? ''
const describeDb = connectionString ? describe : describe.skip

const schemaName = 'zona_p6_audit_tx_test'

function scopedConnectionString(): string {
  const url = new URL(connectionString)
  url.searchParams.set('options', `-csearch_path=${schemaName},public`)
  return url.toString().replace(/^postgres:\/\//, 'postgresql://')
}

function session(adminId: string) {
  return {
    session: {
      id: `sess-${adminId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      userId: adminId,
      expiresAt: new Date(Date.now() + 86_400_000),
      token: `tok-${adminId}`,
    },
    user: {
      id: adminId,
      email: `${adminId}@example.test`,
      name: 'Admin Utama',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role: 'admin',
      banned: false,
    },
  }
}

describeDb('Audit mutation rollback on isolated PostgreSQL', () => {
  let sql: Sql
  let database: PgDatabase<typeof schema>
  let auth: typeof AuthModule
  let retireAdminModelCore: typeof RetireAdminModelCore
  let deleteUserCore: typeof DeleteUserCore
  let resetDevCreditsCore: typeof ResetDevCreditsCore
  let updateFeedbackStatusCore: typeof UpdateFeedbackStatusCore
  let fixtureUserId: string
  beforeAll(async () => {
    const root = postgres(connectionString, { max: 1 })
    try {
      await root`DROP SCHEMA IF EXISTS zona_p6_audit_tx_test CASCADE`
      await root`CREATE SCHEMA zona_p6_audit_tx_test`
    } finally {
      await root.end()
    }
    process.env.DATABASE_URL = scopedConnectionString()
    sql = postgres(process.env.DATABASE_URL, { max: 1 })
    await sql`SET search_path TO zona_p6_audit_tx_test, public`
    database = drizzle(sql, { schema })
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'src/lib/db/migrations'),
      migrationsSchema: schemaName,
    })
    const publicUsers =
      await sql`SELECT id FROM public.users WHERE email NOT LIKE '%@example.com' ORDER BY created_at ASC LIMIT 1`
    const publicUser = publicUsers[0]
    if (!publicUser) {
      throw new Error(
        'No durable public user available for isolated FK fixture',
      )
    }
    fixtureUserId = String(publicUser.id)
    auth = await import('../../src/lib/auth/auth')
    ;({ retireAdminModelCore } = await import(
      '../../src/server/core/admin-models'
    ))
    ;({ deleteUserCore } = await import('../../src/server/core/admin-users'))
    ;({ resetDevCreditsCore } = await import('../../src/server/core/credits'))
    ;({ updateFeedbackStatusCore } = await import(
      '../../src/server/core/feedback'
    ))
  }, 60_000)

  beforeEach(async () => {
    await sql`TRUNCATE TABLE zona_p6_audit_tx_test.audit_logs, zona_p6_audit_tx_test.credit_transactions, zona_p6_audit_tx_test.feedback, zona_p6_audit_tx_test.model_settings, zona_p6_audit_tx_test.model_catalog, zona_p6_audit_tx_test.users CASCADE`
    vi.restoreAllMocks()
  })

  afterAll(async () => {
    await sql?.end()
    const root = postgres(connectionString, { max: 1 })
    try {
      await root`DROP SCHEMA IF EXISTS zona_p6_audit_tx_test CASCADE`
    } finally {
      await root.end()
    }
  })

  const request = new Request('http://localhost:3000/admin/audit-log')

  async function seed() {
    await database.insert(schema.users).values({
      id: fixtureUserId,
      email: 'fixture-user@example.test',
      name: 'Pengguna Uji',
      role: 'admin',
      credits: 250,
    })
    await database.insert(schema.feedback).values({
      id: '11111111-1111-4111-8111-111111111111',
      userId: fixtureUserId,
      type: 'bug',
      title: 'Laporan uji',
      description: 'Deskripsi uji',
      status: 'new',
    })
  }

  async function seedDeletableUser() {
    await database.insert(schema.users).values({
      id: 'legacy-user',
      email: 'legacy@example.test',
      name: 'Pengguna Lama',
      role: 'user',
      credits: 50,
    })
  }

  async function seedRetirableModel() {
    await database.insert(schema.modelCatalog).values({
      id: 'model-row-1',
      routerModelId: 'probe/model-1',
      displayName: 'Model Uji',
      provider: 'probe',
      vendor: 'Uji',
      description: 'Model untuk bukti audit',
      intelligenceLevel: 2,
      intelligenceScore: 70,
      intelligenceBars: 3,
      confidence: 'medium',
      creditCostMin: 1,
      creditCostMax: 3,
      creditTier: 'economy',
      capabilities: {
        text: true,
        vision: false,
        files: false,
        tools: false,
        reasoning: false,
        structuredOutput: false,
      },
      searchAliases: [],
      category: 'general',
      speedClass: 'fast',
      routingProfile: 'general',
      provenance: 'isolated-test',
    })
    await database.insert(schema.modelSettings).values({
      modelId: 'model-row-1',
      isActive: true,
      status: 'active',
      updatedBy: fixtureUserId,
    })
    const { invalidateCatalogCache } = await import(
      '../../src/server/core/model-catalog'
    )
    invalidateCatalogCache()
  }

  function mockAdmin(adminId: string) {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session(adminId))
  }

  function failAuditMetadata() {
    vi.spyOn(auditMetadata, 'createAuditMetadata').mockImplementation(() => {
      throw new Error('audit metadata failure')
    })
  }

  it('rolls back nested credit reset and audit log when audit insert fails', async () => {
    await seed()
    mockAdmin(fixtureUserId)
    failAuditMetadata()

    await expect(
      resetDevCreditsCore({ request, targetUserId: fixtureUserId }),
    ).rejects.toBeDefined()

    const [target] = await database
      .select({ credits: schema.users.credits })
      .from(schema.users)
      .where(eq(schema.users.id, fixtureUserId))
    expect(target?.credits).toBe(250)

    const transactions = await database
      .select()
      .from(schema.creditTransactions)
      .where(eq(schema.creditTransactions.userId, fixtureUserId))
    expect(transactions).toHaveLength(0)

    const logs = await database.select().from(schema.auditLogs)
    expect(logs).toHaveLength(0)
  })

  it('commits credit reset and audit log together when inputs are valid', async () => {
    await seed()
    mockAdmin(fixtureUserId)

    const result = await resetDevCreditsCore({
      request,
      targetUserId: fixtureUserId,
    })

    expect(result.newBalance).toBe(100)
    const [target] = await database
      .select({ credits: schema.users.credits })
      .from(schema.users)
      .where(eq(schema.users.id, fixtureUserId))
    expect(target?.credits).toBe(100)

    const logs = await database.select().from(schema.auditLogs)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe('credit.reset')
  })

  it('rolls back feedback status update when audit insert fails', async () => {
    await seed()
    mockAdmin(fixtureUserId)
    failAuditMetadata()

    await expect(
      updateFeedbackStatusCore({
        request,
        data: {
          feedbackId: '11111111-1111-4111-8111-111111111111',
          status: 'resolved',
          adminNotes: 'catatan privat',
        },
      }),
    ).rejects.toBeDefined()

    const [item] = await database
      .select({
        status: schema.feedback.status,
        adminNotes: schema.feedback.adminNotes,
      })
      .from(schema.feedback)
      .where(eq(schema.feedback.id, '11111111-1111-4111-8111-111111111111'))
    expect(item?.status).toBe('new')
    expect(item?.adminNotes).toBeNull()

    const logs = await database.select().from(schema.auditLogs)
    expect(logs).toHaveLength(0)
  })

  it('keeps the deleted user snapshot after a real isolated deletion', async () => {
    await seed()
    await seedDeletableUser()
    mockAdmin(fixtureUserId)

    await deleteUserCore({ request, data: { userId: 'legacy-user' } })

    const users = await database
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, 'legacy-user'))
    expect(users).toHaveLength(0)

    const logs = await database.select().from(schema.auditLogs)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe('user.delete')
    expect(
      auditMetadata.parseAuditLogMetadataValue(logs[0]?.metadata).metadata,
    ).toMatchObject({
      targetSnapshot: { id: 'legacy-user', displayName: 'Pengguna Lama' },
      actorSnapshot: { id: fixtureUserId, displayName: 'Admin Utama' },
    })
  })

  it('rolls back a real user deletion when audit metadata fails', async () => {
    await seed()
    await seedDeletableUser()
    mockAdmin(fixtureUserId)
    failAuditMetadata()

    await expect(
      deleteUserCore({ request, data: { userId: 'legacy-user' } }),
    ).rejects.toBeDefined()

    const users = await database
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, 'legacy-user'))
    expect(users).toHaveLength(1)
    expect(await database.select().from(schema.auditLogs)).toHaveLength(0)
  })

  it('keeps the model snapshot after a real isolated retirement', async () => {
    await seed()
    await seedRetirableModel()
    mockAdmin(fixtureUserId)

    await retireAdminModelCore({ request, modelId: 'probe/model-1' })

    const [setting] = await database
      .select({ status: schema.modelSettings.status })
      .from(schema.modelSettings)
      .where(eq(schema.modelSettings.modelId, 'model-row-1'))
    expect(setting?.status).toBe('retired')

    const logs = await database.select().from(schema.auditLogs)
    expect(logs).toHaveLength(1)
    expect(logs[0]?.action).toBe('model.delete')
    expect(
      auditMetadata.parseAuditLogMetadataValue(logs[0]?.metadata).metadata,
    ).toMatchObject({
      targetSnapshot: { id: 'model-row-1', displayName: 'Model Uji' },
      previousStatus: 'active',
      status: 'retired',
    })
  })

  it('rolls back a real model retirement when audit metadata fails', async () => {
    await seed()
    await seedRetirableModel()
    mockAdmin(fixtureUserId)
    failAuditMetadata()

    await expect(
      retireAdminModelCore({ request, modelId: 'probe/model-1' }),
    ).rejects.toBeDefined()

    const [setting] = await database
      .select({ status: schema.modelSettings.status })
      .from(schema.modelSettings)
      .where(eq(schema.modelSettings.modelId, 'model-row-1'))
    expect(setting?.status).toBe('active')
    expect(await database.select().from(schema.auditLogs)).toHaveLength(0)
  })
})
