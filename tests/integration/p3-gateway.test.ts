// @vitest-environment node
import { streamText } from 'ai'
import { expect, it, vi } from 'vitest'
import { createNineRouter } from '../../src/lib/ai/9router'
import { imagePart } from '../../src/lib/ai/image-part'
import { evaluateGatewayJob } from '../../src/lib/ai/p3-gateway.server'
import { planRun } from '../../src/lib/models/p3-runner'

it('sends actual PNG data only for the requested route and rejects substituted replies', async () => {
  const job = planRun(['test/exact'], 12).find((row) => row.png)
  if (!job?.png) throw new Error('Missing image fixture')
  const transport = vi.fn<typeof fetch>(async (_url, init) => {
    expect(init?.redirect).toBe('error')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: job.route,
      messages: [
        { role: 'system' },
        {
          role: 'user',
          content: [
            { type: 'text' },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${job.png?.toString('base64')}`,
              },
            },
          ],
        },
      ],
    })
    return sse('test/substituted', JSON.stringify(job.expected))
  })
  expect(
    await evaluateGatewayJob(job, 4096, AbortSignal.timeout(3000), transport),
  ).toMatchObject({ state: 'identity-mismatch', points: null })
  expect(transport).toHaveBeenCalledTimes(1)
})

it('serializes the chat and compare attachment part in a streaming request', async () => {
  const job = planRun(['test/exact'], 12).find((row) => row.png)
  if (!job?.png) throw new Error('Missing image fixture')
  const image = imagePart(job.png, 'image/png')
  const transport = vi.fn<typeof fetch>(async (_url, init) => {
    expect(JSON.parse(String(init?.body))).toMatchObject({
      stream: true,
      model: job.route,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text' },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${image.data}` },
            },
          ],
        },
      ],
    })
    return new Response(
      'data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
      { headers: { 'content-type': 'text/event-stream' } },
    )
  })
  const result = streamText({
    model: createNineRouter(transport)(job.route),
    messages: [
      { role: 'user', content: [{ type: 'text', text: job.prompt }, image] },
    ],
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(3000),
  })
  await result.consumeStream()
  expect(transport).toHaveBeenCalledTimes(1)
  expect(await result.finishReason).toBe('stop')
})

it('reports an invalid HTTP 200 response without recording its body or retrying', async () => {
  const job = planRun(['test/exact'], 12)[0]
  const transport = vi.fn<typeof fetch>(async () =>
    Response.json(
      { unexpected: 'private diagnostic fixture' },
      {
        headers: {
          'x-request-id': 'test-request',
          'x-9router-version': 'test-version',
        },
      },
    ),
  )
  const result = await evaluateGatewayJob(
    job,
    512,
    AbortSignal.timeout(3000),
    transport,
  )
  expect(result).toMatchObject({
    state: 'invalid-protocol',
    httpStatus: 200,
    requestId: 'test-request',
    gatewayVersion: 'test-version',
    raw: null,
    points: null,
  })
  expect(transport).toHaveBeenCalledTimes(1)
})

function sse(model: string, content: string) {
  const frame = {
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: 'stop' }],
  }
  return new Response(`data: ${JSON.stringify(frame)}\n\ndata: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

it.each([
  ['test/exact', 'valid', 1],
  ['exact', 'identity-mismatch', null],
])(
  'classifies reported stream identity %s',
  async (identity, state, points) => {
    const job = planRun(['test/exact'], 12)[0]
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        stream: true,
        model: job.route,
      })
      return sse(identity, JSON.stringify(job.expected))
    })
    expect(
      await evaluateGatewayJob(job, 512, AbortSignal.timeout(3000), transport),
    ).toMatchObject({ state, points, identity })
    expect(transport).toHaveBeenCalledTimes(1)
  },
)

const routeProvenance = (model: string) => ({
  at: '2026-01-01T00:00:00.000Z',
  provider: 'github',
  model,
  cost: 0,
  promptTokens: 100,
  completionTokens: 10,
  status: 'ok',
  deltaMs: 12,
})

it('accepts an alias when the gateway resolves the requested route', async () => {
  const job = planRun(['gh/gpt-4.1'], 12).find((row) => row.kind === 'text')
  if (!job) throw new Error('Missing text fixture')
  const transport = vi.fn<typeof fetch>(() =>
    sse('gpt-4.1-2025-04-14', JSON.stringify(job.expected)),
  )
  expect(
    await evaluateGatewayJob(
      job,
      512,
      AbortSignal.timeout(3000),
      transport,
      async () => routeProvenance('gpt-4.1'),
    ),
  ).toMatchObject({ state: 'valid', points: 1, routeVerified: true })
  expect(transport).toHaveBeenCalledTimes(1)
})

it('keeps an alias inconclusive when the gateway resolved another model', async () => {
  const job = planRun(['gh/gpt-4.1'], 12).find((row) => row.kind === 'text')
  if (!job) throw new Error('Missing text fixture')
  const transport = vi.fn<typeof fetch>(() =>
    sse('gpt-4.1-2025-04-14', JSON.stringify(job.expected)),
  )
  expect(
    await evaluateGatewayJob(
      job,
      512,
      AbortSignal.timeout(3000),
      transport,
      async () => routeProvenance('gpt-4o'),
    ),
  ).toMatchObject({ state: 'identity-mismatch', routeVerified: false })
})
