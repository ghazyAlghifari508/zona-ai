/**
 * @vitest-environment node
 */
import { createServer, type ModuleNode, type ViteDevServer } from 'vite'
import { afterAll, describe, expect, it } from 'vitest'

const CLIENT_ARTIFACT_RPC_URL = '/src/server/functions/artifacts.ts'
const SERVER_ONLY_MODULES = [
  '/src/server/core/artifact-repository.ts',
  '/src/lib/db/index.ts',
]

function collectModuleIds(entry: ModuleNode): Set<string> {
  const ids = new Set<string>()
  const pending = [entry]

  while (pending.length > 0) {
    const module = pending.pop()
    if (!module || ids.has(module.id ?? module.url)) continue

    ids.add(module.id ?? module.url)
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

    const moduleIds = collectModuleIds(entry)
    const leakedModules = SERVER_ONLY_MODULES.filter((serverOnlyModule) =>
      [...moduleIds].some((id) =>
        id.replaceAll('\\', '/').includes(serverOnlyModule),
      ),
    )

    expect(leakedModules).toEqual([])
  }, 30_000)
})
