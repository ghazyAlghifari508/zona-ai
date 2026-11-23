// @vitest-environment node
import { expect, it, vi } from 'vitest'
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
