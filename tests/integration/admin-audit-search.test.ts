/**
 * @vitest-environment node
 */
import path from 'node:path'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres, { type Sql } from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { auth as AuthModule } from '../../src/lib/auth/auth'
import * as schema from '../../src/lib/db/schema'
import type {
  listAuditLogsCore as ListAuditLogsCore,
} from '../../src/server/core/admin-audit'

const connectionString = process.env.ZONA_P6_TEST_DATABASE_URL ?? ''
const describeDb = connectionString ? describe : describe.skip

const schemaName = 'zona_p6_audit_test'

function scopedConnectionString(): string {
  const url = new URL(connectionString)
  url.searchParams.set('options', `-csearch_path=${schemaName},public`)
  return url.toString().replace(/^postgres:\/\//, 'postgresql://')
}

function session(role: 'admin' | 'user') {
  return {
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
      email: `${role}@example.test`,
      name: role === 'admin' ? 'Admin Utama' : 'Pengguna Biasa',
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role,
      banned: false,
    },
  }
}

describeDb('Audit log search on isolated PostgreSQL', () => {
  let sql: Sql
  let database: PgDatabase<typeof schema>
  let auth: typeof AuthModule
  let listAuditLogsCore: typeof ListAuditLogsCore

  beforeAll(async () => {
    const root = postgres(connectionString, { max: 1 })
    try {
      await root`DROP SCHEMA IF EXISTS zona_p6_audit_test CASCADE`
      await root`CREATE SCHEMA zona_p6_audit_test`
    } finally {
      await root.end()
    }
    process.env.DATABASE_URL = scopedConnectionString()
    sql = postgres(process.env.DATABASE_URL, { max: 1 })
    await sql`SET search_path TO zona_p6_audit_test, public`
    database = drizzle(sql, { schema })
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'src/lib/db/migrations'),
      migrationsSchema: schemaName,
    })
    auth = await import('../../src/lib/auth/auth')
    ;({ listAuditLogsCore } = await import('../../src/server/core/admin-audit'))
  }, 60_000)

  beforeEach(async () => {
    await sql`TRUNCATE audit_logs, users, model_settings, model_catalog CASCADE`
    vi.restoreAllMocks()
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
  })

  afterAll(async () => {
    await sql?.end()
    const root = postgres(connectionString, { max: 1 })
    try {
      await root`DROP SCHEMA IF EXISTS zona_p6_audit_test CASCADE`
    } finally {
      await root.end()
    }
  })

  async function seedLogs() {
    const fixed = new Date('2026-11-20T10:00:00.000Z')
    await database.insert(schema.auditLogs).values([
      {
        adminId: null,
        adminEmail: 'admin@example.test',
        action: 'user.ban',
        targetId: 'user-target',
        targetType: 'user',
        metadata: {
          actorSnapshot: { id: 'user-admin', displayName: 'Admin Utama' },
          targetSnapshot: {
            id: 'user-target',
            displayName: 'Nama Tersimpan',
          },
        },
        createdAt: fixed,
      },
      {
        adminId: null,
        adminEmail: 'admin@example.test',
        action: 'user.delete',
        targetId: 'user-removed',
        targetType: 'user',
        metadata: {
          actorSnapshot: { id: 'user-admin', displayName: 'Admin Utama' },
          deletedName: 'Nama Lama',
        },
        createdAt: new Date('2026-11-19T10:00:00.000Z'),
      },
      {
        adminId: null,
        adminEmail: 'admin@example.test',
        action: 'model.disable',
        targetId: 'model-x',
        targetType: 'model',
        metadata: {
          actorSnapshot: { id: 'user-admin', displayName: 'Admin Utama' },
          targetSnapshot: {
            id: 'model-x',
            displayName: 'Model 100% diskon',
          },
        },
        createdAt: new Date('2026-11-18T10:00:00.000Z'),
      },
      {
        adminId: null,
        adminEmail: 'admin@example.test',
        action: 'credit.adjust',
        targetId: 'user-target',
        targetType: 'user',
        metadata: {
          actorSnapshot: { id: 'user-admin', displayName: 'Admin Utama' },
        },
        createdAt: fixed,
      },
    ])
  }

  async function seedCurrentTargets() {
    await database.insert(schema.users).values({
      id: 'user-target',
      email: 'target@example.test',
      name: 'Nama Saat Ini',
      role: 'user',
      credits: 0,
    })
    await database.insert(schema.modelCatalog).values({
      id: 'model-x',
      routerModelId: 'probe/model-x',
      displayName: 'Model Saat Ini',
      provider: 'probe',
      vendor: 'Uji',
      description: '',
      intelligenceLevel: 1,
      intelligenceScore: 50,
      intelligenceBars: 2,
      confidence: 'medium',
      creditCostMin: 1,
      creditCostMax: 2,
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
  }

  const request = new Request('http://localhost:3000/admin/audit-log')

  it('finds logs by administrator name, email and ID', async () => {
    await seedLogs()

    const byName = await listAuditLogsCore({ request, search: 'Utama' })
    expect(byName.pagination.total).toBe(4)

    const byEmail = await listAuditLogsCore({
      request,
      search: 'admin@example',
    })
    expect(byEmail.pagination.total).toBe(4)

    const byId = await listAuditLogsCore({ request, search: 'user-admin' })
    expect(byId.pagination.total).toBe(4)
  })

  it('finds target snapshots, deleted names and target IDs', async () => {
    await seedLogs()

    expect((await listAuditLogsCore({ request, search: 'Tersimpan' })).items)
      .toHaveLength(1)
    expect((await listAuditLogsCore({ request, search: 'Nama Lama' })).items)
      .toHaveLength(1)
    expect((await listAuditLogsCore({ request, search: 'model-x' })).items)
      .toHaveLength(1)
  })

  it('resolves and searches current target names', async () => {
    await seedLogs()
    await seedCurrentTargets()

    const result = await listAuditLogsCore({ request, limit: 10 })
    const byTargetId = new Map(result.items.map((item) => [item.targetId, item]))

    expect(byTargetId.get('user-target')?.currentTargetName).toBe('Nama Saat Ini')
    expect(byTargetId.get('model-x')?.currentTargetName).toBe('Model Saat Ini')
    expect(byTargetId.get('user-removed')?.currentTargetName).toBeNull()

    const byUser = await listAuditLogsCore({
      request,
      search: 'Nama Saat Ini',
      limit: 10,
    })
    expect(byUser.items.length).toBeGreaterThan(0)
    expect(
      byUser.items.every((item) => item.targetId === 'user-target'),
    ).toBe(true)

    const byModel = await listAuditLogsCore({
      request,
      search: 'Model Saat Ini',
      limit: 10,
    })
    expect(byModel.items).toHaveLength(1)
    expect(byModel.items[0]?.targetId).toBe('model-x')
  })

  it('treats wildcard characters in search as literal text', async () => {
    await seedLogs()

    const result = await listAuditLogsCore({ request, search: '100%' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.action).toBe('model.disable')
  })

  it('composes search with the action filter before pagination and clamps the page', async () => {
    await seedLogs()

    const result = await listAuditLogsCore({
      request,
      search: 'Nama',
      action: 'user.delete',
      page: 5,
      limit: 10,
    })

    expect(result.pagination).toEqual({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.action).toBe('user.delete')
  })

  it('orders equal timestamps by descending unique ID', async () => {
    await seedLogs()

    const result = await listAuditLogsCore({ request, limit: 10 })
    const sameTime = result.items
      .filter((item) => item.createdAt?.toISOString() === '2026-11-20T10:00:00.000Z')
      .map((item) => item.id)

    expect(sameTime).toHaveLength(2)
    expect(sameTime).toEqual([...sameTime].sort().reverse())
  })

  it('marks unreadable metadata without erasing the event', async () => {
    await database.insert(schema.auditLogs).values({
      adminId: null,
      adminEmail: 'admin@example.test',
      action: 'legacy.custom',
      targetId: 'legacy-1',
      targetType: 'unknown',
      metadata: 'invalid-shape',
      createdAt: new Date(),
    })

    const result = await listAuditLogsCore({ request })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.metadata).toBeNull()
    expect(result.items[0]?.metadataUnreadable).toBe(true)
  })

  it('rejects non-admin search requests', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('user'))

    await expect(
      listAuditLogsCore({ request, search: 'Utama' }),
    ).rejects.toMatchObject({ status: 403, code: 'ERR-003' })
  })

  it('keeps explicit exact filters when no search is supplied', async () => {
    await seedLogs()

    const rows = await database
      .select({ id: schema.auditLogs.id })
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.action, 'user.ban'),
          inArray(schema.auditLogs.targetId, ['user-target']),
        ),
      )
      .orderBy(desc(schema.auditLogs.createdAt))
    expect(rows).toHaveLength(1)

    const result = await listAuditLogsCore({
      request,
      action: 'user.ban',
      targetId: 'user-target',
    })
    expect(result.items).toHaveLength(1)
  })
})
