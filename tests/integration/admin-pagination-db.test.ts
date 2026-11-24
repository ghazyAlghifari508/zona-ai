/**
 * @vitest-environment node
 */
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { eq } from 'drizzle-orm'
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
import { listAdminModelsSchema } from '../../src/lib/admin/model-list-contract'
import * as schema from '../../src/lib/db/schema'
import { AppError } from '../../src/lib/utils/errors'
const connectionString =
  process.env.ZONA_P7_TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
const describeDb = connectionString ? describe : describe.skip
const schemaName = 'zona_p7_pagination_test'

function scopedConnectionString(): string {
  const url = new URL(connectionString)
  url.searchParams.set('options', `-csearch_path=${schemaName},public`)
  return url.toString().replace(/^postgres:\/\//, 'postgresql://')
}



function session(role: 'user' | 'admin') {
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
      email: `${role}@example.com`,
      name: role,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      role,
      banned: false,
    },
  }
}

const request = new Request('http://localhost:3000/api/admin')

describeDb('P7 pagination on isolated PostgreSQL', () => {
  let sql: Sql
  let database: ReturnType<typeof drizzle<typeof schema>>
  let auth: typeof import('../../src/lib/auth/auth')
  let adminModels: typeof import('../../src/server/core/admin-models')
  let audit: typeof import('../../src/server/core/admin-audit')

  beforeAll(async () => {
    const root = postgres(connectionString, { max: 1 })
    try {
      await root`DROP SCHEMA IF EXISTS zona_p7_pagination_test CASCADE`
      await root`CREATE SCHEMA zona_p7_pagination_test`
    } finally {
      await root.end()
    }

    process.env.DATABASE_URL = scopedConnectionString()
    sql = postgres(process.env.DATABASE_URL, { max: 1 })
    await sql`SET search_path TO zona_p7_pagination_test, public`
    database = drizzle(sql, { schema })
    await migrate(database, {
      migrationsFolder: path.resolve(process.cwd(), 'src/lib/db/migrations'),
      migrationsSchema: schemaName,
    })

    auth = await import('../../src/lib/auth/auth')
    adminModels = await import('../../src/server/core/admin-models')
    audit = await import('../../src/server/core/admin-audit')
  }, 30_000)

  beforeEach(async () => {
    await sql`TRUNCATE audit_logs, model_aliases, model_settings, model_catalog, users CASCADE`
    await database.insert(schema.users).values([
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
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
  })

  afterAll(async () => {
    const root = postgres(connectionString, { max: 1 })
    try {
      await root`DROP SCHEMA IF EXISTS zona_p7_pagination_test CASCADE`
    } finally {
      await root.end()
    }
  })

  async function seedModels() {
    const rows = Array.from({ length: 52 }, (_, index) => {
      const number = String(index + 1).padStart(2, '0')
      const provider = index < 10 ? 'beta' : 'alpha'
      return {
        id: `test/model-${number}`,
        routerModelId: `test/model-${number}`,
        displayName: `Model ${number}`,
        provider,
        vendor: provider === 'beta' ? 'Beta' : 'Alpha',
        description: 'synthetic fixture',
        intelligenceLevel: 1,
        intelligenceScore: 1,
        intelligenceBars: 1,
        confidence: 'medium',
        creditCostMin: 1,
        creditCostMax: 1,
        creditTier: 'balanced',
        capabilities: {
          text: true,
          vision: false,
          files: false,
          tools: false,
          reasoning: false,
          structuredOutput: false,
        },
        searchAliases: [],
        contextWindow: 1000,
        maxOutput: null,
        pricingInput: null,
        pricingOutput: null,
        category: 'general',
        speedClass: 'medium',
        routingProfile: 'general',
        routingPriority: 0,
        isVirtual: false,
        evaluationStatus: 'legacy',
        visionStatus: 'unverified',
        provenance: 'synthetic-fixture',
      }
    })
    rows[0].displayName = 'Model Duplicate'
    rows[1].displayName = 'Model Duplicate'
    rows[2].routerModelId = 'custom/exact-route'
    rows[1].evaluationStatus = 'pending'
    rows[3].searchAliases = ['Alias Unik']
    rows.push({
      ...rows[0],
      id: 'test/auto',
      routerModelId: 'test/auto',
      displayName: 'Auto',
      isVirtual: true,
      routingProfile: 'router',
    })
    rows.push({
      ...rows[1],
      id: 'test/retired',
      routerModelId: 'test/retired',
      displayName: 'Retired',
    })

    await database.insert(schema.modelCatalog).values(rows)
    await database.insert(schema.modelSettings).values(
      rows.map((row) => ({
        modelId: row.id,
        status:
          row.id === 'test/retired'
            ? 'retired'
            : row.id === 'test/model-01'
              ? 'inactive'
              : 'active',
        isActive: row.id !== 'test/retired' && row.id !== 'test/model-01',
      })),
    )
  }

  it('pages bounded active models with stable unique ids and global providers', async () => {
    await seedModels()
    const seen: string[] = []

    for (const page of [1, 2, 3, 4, 5, 6]) {
      const result = await adminModels.listAdminModelsCore({
        request,
        page,
        pageSize: 10,
      })
      expect(result.items.length).toBeLessThanOrEqual(10)
      expect(result.pagination).toMatchObject({
        page,
        pageSize: 10,
        total: 53,
        totalPages: 6,
        start: (page - 1) * 10 + 1,
        end: Math.min(page * 10, 53),
      })
      expect(result.providers).toEqual(['Alpha', 'Beta'])
      seen.push(...result.items.map((item) => item.id))
    }

    expect(seen).toHaveLength(53)
    expect(new Set(seen).size).toBe(53)
    expect(seen.filter((id) => id === 'test/auto')).toHaveLength(1)
    expect(seen).not.toContain('test/retired')
    expect(seen.indexOf('test/model-01')).toBeLessThan(
      seen.indexOf('test/model-02'),
    )
  })

  it('clamps out-of-range pages and reports an honest empty result', async () => {
    await seedModels()
    const last = await adminModels.listAdminModelsCore({
      request,
      page: 100,
      pageSize: 10,
    })
    expect(last.pagination.page).toBe(6)
    expect(last.items.length).toBeGreaterThan(0)

    const empty = await adminModels.listAdminModelsCore({
      request,
      page: 2,
      search: 'no-such-model',
    })
    expect(empty).toMatchObject({
      items: [],
      pagination: {
        page: 1,
        pageSize: 10,
        total: 0,
        totalPages: 0,
        start: 0,
        end: 0,
      },
    })
  })

  it('rejects invalid page bounds, page sizes, and unknown fields', () => {
    expect(listAdminModelsSchema.safeParse({ page: 0 }).success).toBe(false)
    expect(listAdminModelsSchema.safeParse({ page: 100_001 }).success).toBe(
      false,
    )
    expect(listAdminModelsSchema.safeParse({ pageSize: 15 }).success).toBe(
      false,
    )
    expect(
      listAdminModelsSchema.safeParse({ search: 'x'.repeat(121) }).success,
    ).toBe(false)
    expect(listAdminModelsSchema.safeParse({ unknown: true }).success).toBe(
      false,
    )
  })

  it('denies non-admin model listing', async () => {
    await seedModels()
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValueOnce(session('user'))
    await expect(
      adminModels.listAdminModelsCore({ request }),
    ).rejects.toBeInstanceOf(AppError)
  })

  it('filters provider rows but keeps provider options from the whole catalog', async () => {
    await seedModels()
    const result = await adminModels.listAdminModelsCore({
      request,
      provider: 'beta',
      pageSize: 10,
    })
    expect(result.items.length).toBe(10)
    expect(result.items.every((item) => item.provider === 'beta')).toBe(true)
    expect(result.providers).toEqual(['Alpha', 'Beta'])
    const none = await adminModels.listAdminModelsCore({
      request,
      provider: 'gamma',
    })
    expect(none.pagination.total).toBe(0)
    expect(none.items).toEqual([])
  })

  it('filters inactive models while pending-evaluated entries stay in the default list', async () => {
    await seedModels()
    const defaultList = await adminModels.listAdminModelsCore({
      request,
      search: 'model-02',
    })
    expect(defaultList.items.map((item) => item.id)).toEqual(['test/model-02'])
    expect(defaultList.items[0]?.evaluationStatus).toBe('pending')

    const inactive = await adminModels.listAdminModelsCore({
      request,
      status: 'inactive',
    })
    expect(inactive.pagination.total).toBe(1)
    expect(inactive.items.map((item) => item.id)).toEqual(['test/model-01'])
  })

  it('searches case-insensitively across names, ids, routes, providers, vendors, and stored aliases', async () => {
    await seedModels()

    const terms = [
      ['MODEL DUPLICATE', 'test/model-01'],
      ['TEST/MODEL-05', 'test/model-05'],
      ['CUSTOM/EXACT-ROUTE', 'test/model-03'],
      ['BETA', 'test/model-01'],
      ['ALIAS UNIK', 'test/model-04'],
    ] as const

    for (const [search, expectedId] of terms) {
      const result = await adminModels.listAdminModelsCore({ request, search })
      expect(result.items.map((item) => item.id)).toContain(expectedId)
    }
  })

  it('clamps once when the last row of the last filtered page is retired', async () => {
    await seedModels()
    const before = await adminModels.listAdminModelsCore({
      request,
      provider: 'beta',
      page: 2,
      pageSize: 10,
    })
    expect(before.pagination).toMatchObject({ page: 2, total: 11, totalPages: 2 })
    expect(before.items).toHaveLength(1)
    const id = before.items[0]?.id
    expect(id).toBeDefined()
    if (id === undefined) return

    await database
      .update(schema.modelSettings)
      .set({ status: 'retired' })
      .where(eq(schema.modelSettings.modelId, id))

    const after = await adminModels.listAdminModelsCore({
      request,
      provider: 'beta',
      page: 2,
      pageSize: 10,
    })
    expect(after.pagination).toMatchObject({ page: 1, total: 10, totalPages: 1 })
    expect(after.items).toHaveLength(10)
  })

  it('reflects an added model in totals and provider options', async () => {
    await seedModels()
    const before = await adminModels.listAdminModelsCore({
      request,
      pageSize: 10,
    })
    expect(before.pagination.total).toBe(53)

    const id = 'test/model-new'
    await database.insert(schema.modelCatalog).values({
      id,
      routerModelId: id,
      displayName: 'Model New',
      provider: 'gamma',
      vendor: 'Gamma',
      description: 'synthetic fixture',
      intelligenceLevel: 1,
      intelligenceScore: 1,
      intelligenceBars: 1,
      confidence: 'medium',
      creditCostMin: 1,
      creditCostMax: 1,
      creditTier: 'balanced',
      capabilities: {
        text: true,
        vision: false,
        files: false,
        tools: false,
        reasoning: false,
        structuredOutput: false,
      },
      searchAliases: [],
      contextWindow: 1000,
      category: 'general',
      speedClass: 'medium',
      routingProfile: 'general',
      evaluationStatus: 'legacy',
      visionStatus: 'unverified',
      provenance: 'synthetic-fixture',
    })
    await database
      .insert(schema.modelSettings)
      .values({ modelId: id, status: 'active', isActive: true })

    const after = await adminModels.listAdminModelsCore({
      request,
      pageSize: 10,
    })
    expect(after.pagination).toMatchObject({ total: 54, totalPages: 6 })
    expect(after.providers).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  async function seedAuditEvents() {
    const ids = Array.from({ length: 13 }, () => randomUUID())
    const createdAt = new Date('2026-11-25T00:00:00.000Z')
    await database.insert(schema.auditLogs).values(
      ids.map((id, index) => ({
        id,
        adminId: null,
        adminEmail: 'admin@example.com',
        action: 'user.ban',
        targetId: `user-${index + 1}`,
        targetType: 'user',
        metadata: null,
        createdAt: new Date(createdAt.getTime() + index * 1000),
      })),
    )
    return ids
  }

  it('paginates audit activity in fixed newest-first pages', async () => {
    const ids = await seedAuditEvents()
    const first = await audit.listAuditLogsCore({
      request,
      page: 1,
      limit: 5,
    })
    const second = await audit.listAuditLogsCore({
      request,
      page: 2,
      limit: 5,
    })
    const third = await audit.listAuditLogsCore({
      request,
      page: 3,
      limit: 5,
    })

    expect(first.pagination).toMatchObject({
      total: 13,
      page: 1,
      limit: 5,
      totalPages: 3,
    })
    expect(first.items).toHaveLength(5)
    expect(second.items).toHaveLength(5)
    expect(third.items).toHaveLength(3)
    const allIds = [...first.items, ...second.items, ...third.items].map(
      (item) => item.id,
    )
    expect(allIds).toEqual([...ids].reverse())
  })

  it('denies non-admin audit feed access', async () => {
    await seedAuditEvents()
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValueOnce(session('user'))
    await expect(
      audit.listAuditLogsCore({ request, page: 1, limit: 5 }),
    ).rejects.toBeInstanceOf(AppError)
  })
})
