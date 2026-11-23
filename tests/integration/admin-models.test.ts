/**
 * @vitest-environment node
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
import * as schema from '../../src/lib/db/schema'
import { p3Manifest } from '../../src/lib/models/p3-manifest'
import { planRun } from '../../src/lib/models/p3-runner'
import { suiteVersion } from '../../src/lib/models/p3-suite'
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
      .set({
        isActive: false,
        status: 'inactive',
        disabledReason: 'Maintenance',
      })
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
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValueOnce(session('user'))
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
    const [conversation] = await sql<{
      id: string
    }>`INSERT INTO conversations (user_id, title, model_id) VALUES ('user-admin', 'Legacy chat', 'cx/gpt-5.6-terra') RETURNING id`
    await sql`INSERT INTO messages (conversation_id, role, content) VALUES (${conversation?.id}, 'user', 'legacy message')`
    await sql`INSERT INTO artifacts (user_id, conversation_id, kind, title) VALUES ('user-admin', ${conversation?.id}, 'prd', 'Legacy artifact')`
    await sql`INSERT INTO credit_transactions (user_id, amount, type, model_id, balance_after) VALUES ('user-admin', -15, 'generation', 'cx/gpt-5.6-terra', 777)`
    await sql`INSERT INTO audit_logs (admin_id, admin_email, action, target_id, target_type) VALUES ('user-admin', 'admin@example.com', 'model.disable', 'cx/gpt-5.6-terra', 'model')`

    const migration = readFileSync(
      path.resolve(
        process.cwd(),
        'src/lib/db/migrations/0019_model_catalog.sql',
      ),
      'utf8',
    )
    await sql.unsafe(migration.replaceAll('--> statement-breakpoint', ''))

    const [user] = await sql<{
      credits: number
    }>`SELECT credits FROM users WHERE id = 'user-admin'`
    const [storedConversation] = await sql<{
      title: string
    }>`SELECT title FROM conversations WHERE id = ${conversation?.id}`
    const [messageCount] = await sql<{
      value: number
    }>`SELECT count(*)::int AS value FROM messages`
    const [artifactCount] = await sql<{
      value: number
    }>`SELECT count(*)::int AS value FROM artifacts`
    const [creditCount] = await sql<{
      value: number
    }>`SELECT count(*)::int AS value FROM credit_transactions`
    const [auditCount] = await sql<{
      value: number
    }>`SELECT count(*)::int AS value FROM audit_logs`
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
    expect(
      await catalog.getEligibleModel('cx/gpt-5.6-terra', database),
    ).toBeNull()
  })

  it('imports an exact route as a pending draft without inventing credit or eligibility', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    const result = await adminModels.importAdminModelCore({
      request: new Request('http://localhost:3000/api/admin/models'),
      input: {
        modelId: 'custom/route:free',
        displayName: 'Custom Route',
        vendor: 'Custom',
        provider: 'custom',
        description: 'Route available on the configured gateway',
        searchAliases: ['custom'],
        contextWindow: null,
      },
    })

    expect(result).toMatchObject({
      success: true,
      modelId: 'custom/route:free',
      status: 'active',
      evaluationStatus: 'pending',
    })
    const entry = (await catalog.getPublicCatalog(undefined, true)).find(
      (item) => item.id === 'custom/route:free',
    )
    expect(entry?.creditCost).toBeNull()
    expect(entry?.metadata.contextWindow).toBeNull()
    expect(await catalog.getEligibleModel('custom/route:free')).toBeNull()
    const auditRows = await database.select().from(schema.auditLogs)
    expect(auditRows).toMatchObject([
      {
        action: 'model.create',
        targetId: 'custom/route:free',
        adminId: 'user-admin',
      },
    ])
  })

  it('rejects duplicate exact routes and keeps same-basename routes distinct', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    const request = new Request('http://localhost:3000/api/admin/models')
    const input = {
      displayName: 'DeepSeek Route',
      vendor: 'DeepSeek',
      provider: 'cx',
      description: 'Route on the gateway',
      searchAliases: [],
    }
    await adminModels.importAdminModelCore({
      request,
      input: { ...input, modelId: 'cx/deepseek-chat' },
    })
    await adminModels.importAdminModelCore({
      request,
      input: { ...input, modelId: 'cx/deepseek-reasoner' },
    })

    await expect(
      adminModels.importAdminModelCore({
        request,
        input: { ...input, modelId: ' cx/deepseek-chat ' },
      }),
    ).rejects.toMatchObject({ code: 'ERR-MODEL-DUPLICATE' })
    expect(
      (await catalog.getPublicCatalog(undefined, true)).filter((item) =>
        item.id.startsWith('cx/deepseek'),
      ),
    ).toHaveLength(2)
    const auditRows = await database.select().from(schema.auditLogs)
    expect(auditRows).toHaveLength(2)
  })

  it('denies every admin mutation for non-admin sessions', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('user'))
    const request = new Request('http://localhost:3000/api/admin/models')
    await expect(
      adminModels.importAdminModelCore({
        request,
        input: {
          modelId: 'custom/route:free',
          displayName: 'Custom',
          vendor: 'Custom',
          provider: 'custom',
          description: '',
          searchAliases: [],
        },
      }),
    ).rejects.toBeInstanceOf(AppError)
    await expect(
      adminModels.updateAdminModelCore({
        request,
        input: {
          modelId: 'cx/gpt-5.6-sol',
          displayName: 'Renamed',
          vendor: 'OpenAI',
          provider: 'codex',
          description: '',
          searchAliases: [],
        },
      }),
    ).rejects.toBeInstanceOf(AppError)
    await expect(
      adminModels.retireAdminModelCore({
        request,
        modelId: 'cx/gpt-5.6-sol',
      }),
    ).rejects.toBeInstanceOf(AppError)
    expect(await database.select().from(schema.auditLogs)).toHaveLength(0)
  })

  it('retires a model without deleting history, and reimports it without duplication', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    const request = new Request('http://localhost:3000/api/admin/models')
    const retired = await adminModels.retireAdminModelCore({
      request,
      modelId: 'cx/gpt-5.6-sol',
    })
    expect(retired.status).toBe('retired')
    expect(
      (await catalog.getPublicCatalog()).some(
        (item) => item.id === 'cx/gpt-5.6-sol',
      ),
    ).toBe(false)
    expect(
      await catalog.findHistoricalModelLabel('cx/gpt-5.6-sol'),
    ).toMatchObject({ status: 'retired' })
    expect(await catalog.getEligibleModel('cx/gpt-5.6-sol')).toBeNull()

    await expect(
      adminModels.retireAdminModelCore({ request, modelId: 'auto' }),
    ).rejects.toMatchObject({ code: 'ERR-MODEL-RESERVED' })

    const restored = await adminModels.importAdminModelCore({
      request,
      input: {
        modelId: 'cx/gpt-5.6-sol',
        displayName: 'GPT 5.6 Sol',
        vendor: 'OpenAI',
        provider: 'codex',
        description: 'Restored route',
        searchAliases: [],
        reimport: true,
      },
    })
    expect(restored.modelId).toBe('cx/gpt-5.6-sol')
    expect(
      (await catalog.getPublicCatalog(undefined, true)).filter(
        (item) => item.id === 'cx/gpt-5.6-sol',
      ),
    ).toHaveLength(1)
  })

  it('updates editable metadata only and audits both before and after', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    await adminModels.updateAdminModelCore({
      request: new Request('http://localhost:3000/api/admin/models'),
      input: {
        modelId: 'cx/gpt-5.6-sol',
        displayName: 'Sol renamed',
        vendor: 'OpenAI',
        provider: 'codex',
        description: 'Updated by admin',
        searchAliases: ['sol'],
      },
    })
    const entry = (await catalog.getPublicCatalog()).find(
      (item) => item.id === 'cx/gpt-5.6-sol',
    )
    expect(entry).toMatchObject({
      displayName: 'Sol renamed',
      routerModelId: 'cx/gpt-5.6-sol',
      evaluationStatus: 'legacy',
    })
    const [auditRow] = await database.select().from(schema.auditLogs)
    expect(auditRow).toMatchObject({ action: 'model.update' })
    const metadata = auditRow?.metadata
    expect(
      metadata && typeof metadata === 'object' && 'before' in metadata,
    ).toBe(true)
  })

  it('records an honest connection test without changing availability or rating', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      if (String(input).endsWith('/models')) {
        return new Response(
          JSON.stringify({
            data: [{ id: 'cx/gpt-5.6-sol', owned_by: 'codex' }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      return new Response(
        JSON.stringify({
          model: 'cx/gpt-5.6-sol',
          choices: [{ message: { role: 'assistant', content: 'ok' } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })

    const result = await adminModels.probeAdminModelCore({
      request: new Request('http://localhost:3000/api/admin/models'),
      modelId: 'cx/gpt-5.6-sol',
    })
    expect(result.outcome).toBe('valid')
    expect(result.listed).toBe(true)
    const [auditRow] = await database.select().from(schema.auditLogs)
    expect(auditRow).toMatchObject({
      action: 'model.connection_test',
      targetId: 'cx/gpt-5.6-sol',
    })
    expect(JSON.stringify(auditRow?.metadata ?? {})).not.toContain('apiKey')
    expect(await catalog.getEligibleModel('cx/gpt-5.6-sol')).not.toBeNull()
    expect(
      (await catalog.getPublicCatalog()).find(
        (item) => item.id === 'cx/gpt-5.6-sol',
      )?.evaluationStatus,
    ).toBe('legacy')
  })

  it('rejects manual activation of an unevaluated model', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    const request = new Request('http://localhost:3000/api/admin/models')
    await adminModels.importAdminModelCore({
      request,
      input: {
        modelId: 'custom/route:free',
        displayName: 'Custom Route',
        vendor: 'Custom',
        provider: 'custom',
        description: '',
        searchAliases: [],
      },
    })

    await expect(
      adminModels.updateModelAvailabilityCore({
        request,
        modelId: 'custom/route:free',
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: 'ERR-MODEL-UNVERIFIED' })
    expect(await database.select().from(schema.auditLogs)).toHaveLength(1)
  })

  it('publishes an imported model only through guarded evaluation evidence', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    const request = new Request('http://localhost:3000/api/admin/models')
    await adminModels.importAdminModelCore({
      request,
      input: {
        modelId: 'custom/route:paid',
        displayName: 'Custom Paid',
        vendor: 'Custom',
        provider: 'custom',
        description: '',
        searchAliases: [],
      },
    })
    expect(await catalog.getEligibleModel('custom/route:paid')).toBeNull()

    const modelId = 'custom/route:paid'
    const run = `fixture-${randomUUID()}`
    const dir = path.join('test-results', 'p3', run)
    const input = { request, modelId, run }
    await expect(
      adminModels.publishAdminModelCore(input),
    ).rejects.toMatchObject({ code: 'ERR-MODEL-EVIDENCE' })
    const frozen = {
      runnerVersion: 'zona-p3-runner-v1',
      suiteVersion,
      seed: 12,
      routes: [modelId],
    }
    const hash = createHash('sha256')
      .update(JSON.stringify(frozen))
      .digest('hex')
    mkdirSync(dir, { recursive: true })
    try {
      writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({ hash, ...frozen }),
      )
      const evidence = planRun([modelId], 12).map((job) =>
        JSON.stringify({
          key: job.key,
          route: modelId,
          identity: modelId,
          state: 'valid',
          finish: 'stop',
          fixtureHash: job.hash,
          at: new Date().toISOString(),
          raw: JSON.stringify(
            job.id.endsWith(':control') ? null : job.expected,
          ),
        }),
      )
      writeFileSync(
        path.join(dir, 'attempts.jsonl'),
        evidence.slice(1).join('\n'),
      )
      await expect(
        adminModels.publishAdminModelCore(input),
      ).rejects.toMatchObject({ code: 'ERR-MODEL-EVIDENCE' })
      expect(await catalog.getEligibleModel(modelId)).toBeNull()
      writeFileSync(path.join(dir, 'attempts.jsonl'), evidence.join('\n'))
      expect(
        (await adminModels.publishAdminModelCore(input)).evaluationStatus,
      ).toBe('verified')
      expect(
        (await adminModels.publishAdminModelCore(input)).evaluationStatus,
      ).toBe('verified')
      expect(await catalog.getEligibleModel(modelId)).toMatchObject({
        routerModelId: modelId,
        creditCost: 15,
        visionStatus: 'supported',
      })
      expect(
        (await catalog.getPublicCatalog()).find((item) => item.id === modelId)
          ?.creditCost,
      ).toBe(15)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
    const rows = await database.select().from(schema.auditLogs)
    expect(rows.map((row) => row.action)).toEqual([
      'model.create',
      'model.update',
    ])
  })

  it('stages pending routes and retires only the approved set after publication', async () => {
    vi.spyOn(auth.auth.api, 'getSession').mockResolvedValue(session('admin'))
    const request = new Request('http://localhost:3000/api/admin/models')
    const pending = p3Manifest.added[0].routerModelId
    vi.spyOn(
      await import('../../src/lib/models/model-probe'),
      'discoverGatewayModels',
    ).mockResolvedValue([])
    expect(await adminModels.stageP3CatalogCore(request)).toEqual({
      missing: [],
      drift: [],
      conflicts: [],
    })
    expect(await catalog.getEligibleModel(pending)).toBeNull()
    await expect(
      adminModels.cutoverP3CatalogCore(request, p3Manifest.version),
    ).rejects.toThrow('No verified active new route')
    const run = `fixture-${randomUUID()}`
    const dir = path.join('test-results', 'p3', run)
    const frozen = {
      runnerVersion: 'zona-p3-runner-v1',
      suiteVersion,
      seed: 12,
      routes: [pending],
    }
    mkdirSync(dir, { recursive: true })
    try {
      const hash = createHash('sha256')
        .update(JSON.stringify(frozen))
        .digest('hex')
      writeFileSync(
        path.join(dir, 'manifest.json'),
        JSON.stringify({ hash, ...frozen }),
      )
      writeFileSync(
        path.join(dir, 'attempts.jsonl'),
        planRun([pending], 12)
          .map((job) =>
            JSON.stringify({
              key: job.key,
              route: pending,
              identity: pending,
              state: 'valid',
              finish: 'stop',
              fixtureHash: job.hash,
              at: new Date().toISOString(),
              raw: JSON.stringify(
                job.kind === 'text' || job.id.endsWith(':control')
                  ? null
                  : job.expected,
              ),
            }),
          )
          .join('\n'),
      )
      await adminModels.publishAdminModelCore({
        request,
        modelId: pending,
        run,
      })
      const cutover = await adminModels.cutoverP3CatalogCore(
        request,
        p3Manifest.version,
      )
      expect(cutover.final).toHaveLength(19)
      expect(new Set(cutover.retired)).toEqual(
        new Set(p3Manifest.retire.map((row) => row.routerModelId)),
      )
      for (const id of p3Manifest.retained)
        expect(await catalog.findHistoricalModelLabel(id)).toMatchObject({
          id,
          routerModelId: id,
        })
      expect(await catalog.getEligibleModel('gpt-5.6-sol')).toBeNull()
      expect(
        await catalog.findHistoricalModelLabel('gpt-5.6-sol'),
      ).toMatchObject({ status: 'retired' })
      expect(await catalog.resolveTitleModel()).toBe(pending)
      expect(
        await catalog.resolveAutoForInference({ prompt: 'Hello', credits: 2 }),
      ).toBeNull()
      expect(
        await catalog.resolveAutoForInference({ prompt: 'Hello', credits: 3 }),
      ).toMatchObject({ routerModelId: pending, cost: 3 })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
