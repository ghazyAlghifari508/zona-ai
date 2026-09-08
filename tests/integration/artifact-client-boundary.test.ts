/**
 * @vitest-environment node
 */
import { createServer, type ModuleNode, type ViteDevServer } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

const CLIENT_ARTIFACT_RPC_URL = '/src/server/functions/artifacts.ts'
const ARTIFACT_SERVER_CORRIDOR = [
  '/src/server/functions/artifacts.ts',
  '/src/server/core/artifact-reads.',
  '/src/server/core/artifact-repository.ts',
  '/src/lib/db/index.ts',
]
const FORBIDDEN_CLIENT_BOUNDARIES = {
  artifactReadCore: ['/src/server/core/artifact-reads.'],
  artifactRepository: ['/src/server/core/artifact-repository.ts'],
  databaseClient: ['/src/lib/db/index.ts'],
  drizzlePostgresAdapter: [
    '/node_modules/drizzle-orm/postgres-js',
    '/node_modules/.vite/deps/drizzle-orm_postgres-js',
  ],
  postgresDriver: [
    '/node_modules/postgres/',
    '/node_modules/.vite/deps/postgres.js',
  ],
} as const

function normalizedModuleId(module: ModuleNode): string {
  return (module.id ?? module.url).replaceAll('\\', '/').split('?')[0]
}

function shouldTransform(module: ModuleNode): boolean {
  const id = normalizedModuleId(module)
  return ARTIFACT_SERVER_CORRIDOR.some((corridorModule) =>
    id.includes(corridorModule),
  )
}

async function collectArtifactBoundaryIds(
  server: ViteDevServer,
  entry: ModuleNode,
): Promise<Set<string>> {
  const ids = new Set<string>()
  const pending = [entry]

  while (pending.length > 0) {
    const module = pending.pop()
    if (!module) continue

    const id = normalizedModuleId(module)
    if (ids.has(id)) continue

    ids.add(id)
    if (shouldTransform(module)) await server.transformRequest(module.url)
    pending.push(...module.importedModules)
  }

  return ids
}

describe('artifact client import boundary', () => {
  let server: ViteDevServer | undefined

  afterAll(async () => {
    await server?.close()
  })

  it('keeps artifact repository and database modules outside the route client graph', async () => {
    server = await createServer({
      appType: 'custom',
      server: { middlewareMode: true },
    })

    await server.transformRequest(CLIENT_ARTIFACT_RPC_URL)
    const entry = await server.moduleGraph.getModuleByUrl(
      CLIENT_ARTIFACT_RPC_URL,
    )
    if (!entry)
      throw new Error('artifact RPC transform did not create a module')

    const moduleIds = await collectArtifactBoundaryIds(server, entry)
    const leakedBoundaries = Object.entries(FORBIDDEN_CLIENT_BOUNDARIES)
      .filter(([, patterns]) =>
        patterns.some((pattern) =>
          [...moduleIds].some((id) => id.includes(pattern)),
        ),
      )
      .map(([boundary]) => boundary)

    expect(leakedBoundaries).toEqual([])
  }, 30_000)
})
