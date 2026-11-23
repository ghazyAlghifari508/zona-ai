import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MODEL_PROBE_CONFIG,
  discoverGatewayModels,
  probeModelConnection,
  resolveGatewayEndpoint,
} from '../../src/lib/models/model-probe'

const config = {
  baseUrl: 'http://localhost:20128/v1',
  apiKey: 'unit-test-key',
  timeoutMs: 100,
}

const jsonResponse = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })

const completion = (model: string, content: string) => ({
  id: 'chatcmpl-test',
  model,
  choices: [
    { index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' },
  ],
})

afterEach(() => vi.restoreAllMocks())

describe('gateway endpoint resolution', () => {
  it('does not duplicate the /v1 prefix', () => {
    expect(resolveGatewayEndpoint('http://localhost:20128/v1', '/models')).toBe(
      'http://localhost:20128/v1/models',
    )
    expect(
      resolveGatewayEndpoint('http://localhost:20128/v1/', '/chat/completions'),
    ).toBe('http://localhost:20128/v1/chat/completions')
    expect(resolveGatewayEndpoint('http://localhost:20128', '/models')).toBe(
      'http://localhost:20128/v1/models',
    )
  })

  it('rejects non-HTTP bases and credentials embedded in the URL', () => {
    expect(() => resolveGatewayEndpoint('file:///etc/passwd', '/models')).toThrow()
    expect(() =>
      resolveGatewayEndpoint('http://user:pass@localhost:20128/v1', '/models'),
    ).toThrow()
  })
})

describe('model connection probe', () => {
  it('reports valid only for a non-empty assistant answer on the exact route', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        jsonResponse(completion('cx/deepseek-chat', 'ok')),
    )

    const result = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl,
      listing: [{ id: 'cx/deepseek-chat' }],
    })

    expect(result.outcome).toBe('valid')
    expect(result.listed).toBe(true)
    expect(result.provenanceVerified).toBe(true)
    const urls = fetchImpl.mock.calls.map((call) => String(call[0]))
    const bodies = fetchImpl.mock.calls.map((call) => String(call[1]?.body ?? ''))
    expect(urls).toEqual(['http://localhost:20128/v1/chat/completions'])
    expect(bodies[0]).toContain('"model":"cx/deepseek-chat"')
    expect(bodies[0]).not.toContain('deepseek-chat:free')
  })

  it('marks provenance unverified when the gateway does not echo the model', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(completion('', 'ok')),
    )
    const result = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl,
    })
    expect(result.outcome).toBe('valid')
    expect(result.provenanceVerified).toBe(false)
    expect(result.identityModel).toBeNull()
  })

  it('rejects empty and reasoning-only answers', async () => {
    const empty = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl: async () => jsonResponse(completion('cx/deepseek-chat', '  ')),
    })
    expect(empty.outcome).toBe('invalid_response')

    const reasoning = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl: async () =>
        jsonResponse({
          choices: [
            {
              message: { role: 'assistant', reasoning_content: 'internal' },
            },
          ],
        }),
    })
    expect(reasoning.outcome).toBe('invalid_response')
  })

  it('classifies auth, rate limit and upstream failures honestly', async () => {
    const auth = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl: async () => jsonResponse({ error: {} }, 401),
    })
    expect(auth.outcome).toBe('auth_failure')

    const rateLimited = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl: async () =>
        jsonResponse({ error: {} }, 429, { 'retry-after': '0' }),
    })
    expect(rateLimited.outcome).toBe('rate_limit')

    const upstream = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl: async () => jsonResponse({ error: {} }, 503),
    })
    expect(upstream.outcome).toBe('upstream_error')
  })

  it('retries a transient failure once but never invents success', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: {} }, 502))
      .mockResolvedValueOnce(jsonResponse(completion('cx/deepseek-chat', 'ok')))

    const result = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl,
      listing: [],
    })
    expect(result.outcome).toBe('valid')
    expect(fetchImpl).toHaveBeenCalledTimes(MODEL_PROBE_CONFIG.maxRetries + 1)

    const alwaysFailing = vi.fn(async () => jsonResponse({ error: {} }, 502))
    const failed = await probeModelConnection('cx/deepseek-chat', {
      ...config,
      fetchImpl: alwaysFailing,
      listing: [],
    })
    expect(failed.outcome).toBe('upstream_error')
    expect(alwaysFailing).toHaveBeenCalledTimes(MODEL_PROBE_CONFIG.maxRetries + 1)
  })

  it('does not treat listing absence as proof that a route is unsupported', async () => {
    const result = await probeModelConnection('custom/route:free', {
      ...config,
      fetchImpl: async () =>
        jsonResponse(completion('custom/route:free', 'ok')),
      listing: [{ id: 'other/route' }],
    })
    expect(result.outcome).toBe('valid')
    expect(result.listed).toBe(false)
    expect(result.message).not.toContain('supported')
  })
})

describe('gateway model discovery', () => {
  it('parses exact IDs and optional metadata without inventing values', async () => {
    const models = await discoverGatewayModels({
      ...config,
      fetchImpl: async () =>
        jsonResponse({
          data: [
            {
              id: 'cx/deepseek-chat',
              name: 'DeepSeek Chat',
              context_window: 65536,
            },
            { id: 'cx/deepseek-reasoner' },
          ],
        }),
    })
    expect(models).toEqual([
      {
        id: 'cx/deepseek-chat',
        label: 'DeepSeek Chat',
        contextWindow: 65536,
        maxOutput: null,
        provider: null,
      },
      {
        id: 'cx/deepseek-reasoner',
        label: null,
        contextWindow: null,
        maxOutput: null,
        provider: null,
      },
    ])
  })
})
