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
    return Response.json({
      model: 'test/substituted',
      choices: [
        {
          message: { content: JSON.stringify(job.expected) },
          finish_reason: 'stop',
        },
      ],
    })
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
