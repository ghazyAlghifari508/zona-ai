import { APICallError, generateText } from 'ai'
import { z } from 'zod'
import { createNineRouter } from '../../lib/ai/9router'
import type { Job } from '../../lib/models/p3-runner'
import { classifyAttempt, retryAfterMs } from '../../lib/models/p3-runner'
import { neutralSystem, scoreAnswer } from '../../lib/models/p3-suite'

const identitySchema = z.object({ model: z.string().nullish() })
const errorSchema = z.object({
  error: z.object({ code: z.string().nullish() }),
})
export async function evaluateGatewayJob(
  job: Job,
  maxOutputTokens: number,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
) {
  const model = createNineRouter((request, init) =>
    transport(request, { ...init, redirect: 'error' }),
  )(job.route)
  const start = Date.now()
  try {
    const result = await generateText({
      model,
      maxOutputTokens,
      maxRetries: 0,
      abortSignal: signal,
      system: neutralSystem,
      messages: [
        {
          role: 'user',
          content: job.png
            ? [
                { type: 'text', text: job.prompt },
                {
                  type: 'file',
                  data: job.png.toString('base64'),
                  mediaType: 'image/png',
                },
              ]
            : job.prompt,
        },
      ],
    })
    const body = identitySchema.safeParse(result.response.body)
    const identity = body.success ? (body.data.model ?? null) : null
    const state = classifyAttempt(
      job.route,
      identity,
      result.finishReason,
      result.text,
    )
    const points =
      state === 'valid' ? scoreAnswer(result.text, job.expected) : null
    return {
      state:
        job.kind === 'preflight' && state === 'valid' && points !== 1
          ? 'unexpected-answer'
          : state,
      points,
      identity,
      requestId:
        result.response.headers?.['x-request-id'] ?? result.response.id ?? null,
      gatewayVersion: result.response.headers?.['x-9router-version'] ?? null,
      finish: result.rawFinishReason ?? null,
      raw: result.text,
      usage: result.usage,
      retryMs: 0,
      httpStatus: 200,
      latencyMs: Date.now() - start,
    }
  } catch (error) {
    const httpStatus = APICallError.isInstance(error)
      ? (error.statusCode ?? null)
      : null
    let code: string | null = null
    if (APICallError.isInstance(error) && error.responseBody) {
      try {
        const parsed = errorSchema.safeParse(JSON.parse(error.responseBody))
        if (parsed.success) code = parsed.data.error.code ?? null
      } catch {
        /* Non-JSON error body is not evidence. */
      }
    }
    const state = signal.aborted
      ? 'aborted'
      : httpStatus === 429
        ? 'rate-limit'
        : httpStatus === 401 || httpStatus === 403
          ? 'auth'
          : job.png &&
              (httpStatus === 400 ||
                httpStatus === 415 ||
                httpStatus === 422) &&
              (code === 'unsupported_image' ||
                code === 'image_input_not_supported')
            ? 'image-unsupported'
            : httpStatus !== null && httpStatus < 500
              ? 'http-rejected'
              : 'gateway-error'
    return {
      state,
      points: null,
      identity: null,
      requestId: APICallError.isInstance(error)
        ? (error.responseHeaders?.['x-request-id'] ?? null)
        : null,
      gatewayVersion: null,
      finish: null,
      raw: null,
      usage: null,
      retryMs: APICallError.isInstance(error)
        ? retryAfterMs(
            error.responseHeaders?.['retry-after'] ?? null,
            Date.now(),
          )
        : 0,
      httpStatus,
      latencyMs: Date.now() - start,
    }
  }
}
