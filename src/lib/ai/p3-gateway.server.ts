import { APICallError, type LanguageModelUsage, streamText } from 'ai'
import { z } from 'zod'
import type { Job } from '../models/p3-runner'
import { classifyAttempt, retryAfterMs } from '../models/p3-runner'
import { neutralSystem, scoreAnswer } from '../models/p3-suite'
import { createNineRouter } from './9router'

export type RouteProvenanceResolver = (input: {
  route: string
  finishedAt: Date
}) => Promise<Provenance | null>
import { imagePart } from './image-part'

const identitySchema = z.object({ model: z.string().nullish() })
const errorSchema = z.object({
  error: z.object({ code: z.string().nullish() }),
})
export async function evaluateGatewayJob(
  job: Job,
  maxOutputTokens: number,
  signal: AbortSignal,
  transport: typeof fetch = fetch,
  resolveProvenance: RouteProvenanceResolver = async () => null,
) {
  const model = createNineRouter(async (request, init) => {
    const response = await transport(request, { ...init, redirect: 'error' })
    if (
      response.ok &&
      response.headers
        .get('content-type')
        ?.split(';')[0]
        ?.trim()
        .toLowerCase() !== 'text/event-stream'
    ) {
      await response.body?.cancel()
      throw new APICallError({
        message: 'Expected a gateway event stream',
        url: response.url,
        requestBodyValues: undefined,
        statusCode: response.status,
        responseHeaders: Object.fromEntries(response.headers),
        isRetryable: false,
      })
    }
    return response
  })(job.route)
  const start = Date.now()
  try {
    const result = streamText({
      model,
      maxOutputTokens,
      maxRetries: 0,
      include: { rawChunks: true },
      abortSignal: signal,
      system: neutralSystem,
      messages: [
        {
          role: 'user',
          content: job.png
            ? [
                { type: 'text', text: job.prompt },
                imagePart(job.png, 'image/png'),
              ]
            : job.prompt,
        },
      ],
    })
    let identity: string | null = null
    let mismatch = false
    let text = ''
    let finishReason: string | undefined
    let finish: string | undefined
    let usage: LanguageModelUsage | null = null
    let requestId: string | null = null
    let gatewayVersion: string | null = null
    for await (const event of result.fullStream) {
      if (event.type === 'error') throw event.error
      if (event.type === 'abort') throw new Error('Gateway stream aborted')
      if (event.type === 'raw') {
        const frame = identitySchema.safeParse(event.rawValue)
        const reported = frame.success ? frame.data.model : null
        if (reported && (identity === null || reported !== job.route))
          identity = reported
      } else if (event.type === 'text-delta') text += event.text
      else if (event.type === 'finish-step') {
        requestId =
          event.response.headers?.['x-request-id'] ?? event.response.id ?? null
        gatewayVersion = event.response.headers?.['x-9router-version'] ?? null
      } else if (event.type === 'finish') {
        finishReason = event.finishReason
        finish = event.rawFinishReason
        usage = event.totalUsage
      }
    }
    let provenance: Provenance | null = null
    try {
      provenance = await resolveProvenance({
        route: job.route,
        finishedAt: new Date(),
      })
    } catch {
      provenance = null
    }
    const verified =
      provenance !== null &&
      verifyRouteProvenance(job.route, identity, provenance).verified
    const state = classifyAttempt(
      job.route,
      verified ? job.route : identity,
      finishReason,
      text,
    )
    const points = state === 'valid' ? scoreAnswer(text, job.expected) : null
    return {
      state:
        job.kind === 'preflight' && state === 'valid' && points !== 1
          ? 'unexpected-answer'
          : state,
      points,
      identity,
      requestId,
      gatewayVersion,
      routeVerified: verified,
      gatewayProvider: provenance?.provider ?? null,
      gatewayModel: provenance?.model ?? null,
      gatewayCost: provenance?.cost ?? null,
      finish: finish ?? null,
      raw: text,
      usage,
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
            : httpStatus !== null && httpStatus >= 200 && httpStatus < 300
              ? 'invalid-protocol'
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
      gatewayVersion: APICallError.isInstance(error)
        ? (error.responseHeaders?.['x-9router-version'] ?? null)
        : null,
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
