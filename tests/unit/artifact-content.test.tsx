import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useArtifactContent } from '../../src/components/artifacts/useArtifactContent'

const ART_A = '11111111-1111-4111-8111-111111111111'
const VER_A1 = 'a0000000-0000-4000-8000-000000000001'
const VER_A2 = 'a0000000-0000-4000-8000-000000000002'

function Probe({
  artifactId,
  versionId,
  enabled,
}: {
  artifactId: string
  versionId: string
  enabled?: boolean
}) {
  const { source, isPending, error, refetch } = useArtifactContent({
    artifactId,
    versionId,
    enabled,
  })
  return (
    <div>
      <div data-testid="pending">{isPending ? 'pending' : 'settled'}</div>
      <div data-testid="source">{source ?? 'empty'}</div>
      <div data-testid="error">{error ?? 'no-error'}</div>
      <button type="button" data-testid="retry" onClick={() => refetch()}>
        retry
      </button>
    </div>
  )
}

function renderProbe(
  client: QueryClient,
  props: { artifactId: string; versionId: string; enabled?: boolean },
) {
  return render(
    <QueryClientProvider client={client}>
      <Probe {...props} />
    </QueryClientProvider>,
  )
}

function textResponse(body: string) {
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  })
}

describe('useArtifactContent', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('fetches exact version bytes from the version file route', async () => {
    fetchMock.mockResolvedValue(textResponse('# Exact source'))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    renderProbe(client, { artifactId: ART_A, versionId: VER_A1 })

    await waitFor(() =>
      expect(screen.getByTestId('source').textContent).toBe('# Exact source'),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`/api/artifacts/${ART_A}/versions/${VER_A1}`)
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(client.getQueryData(['artifact-content', ART_A, VER_A1])).toBe(
      '# Exact source',
    )
  })

  it('caches by artifact and version query key', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(textResponse(`source for ${url}`)),
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <Probe artifactId={ART_A} versionId={VER_A1} />
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('source').textContent).toContain(VER_A1),
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender(
      <QueryClientProvider client={client}>
        <Probe artifactId={ART_A} versionId={VER_A1} />
      </QueryClientProvider>,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)

    rerender(
      <QueryClientProvider client={client}>
        <Probe artifactId={ART_A} versionId={VER_A2} />
      </QueryClientProvider>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('source').textContent).toContain(VER_A2),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/artifacts/${ART_A}/versions/${VER_A2}`,
    )
  })

  it.each([
    [401, 'sign in'],
    [403, 'access'],
    [404, 'not found'],
  ])(
    'maps status %i to a safe message without leaking response text',
    async (status, fragment) => {
      fetchMock.mockResolvedValue(
        new Response('{"secret":"leak"}', {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
      renderProbe(client, { artifactId: ART_A, versionId: VER_A1 })

      await waitFor(() =>
        expect(screen.getByTestId('pending').textContent).toBe('settled'),
      )
      const errorText = screen.getByTestId('error').textContent ?? ''
      expect(errorText.toLowerCase()).toContain(fragment)
      expect(errorText).not.toContain('leak')
      expect(screen.getByTestId('source').textContent).toBe('empty')
    },
  )

  it('maps network failure to a safe retryable message', async () => {
    fetchMock.mockRejectedValue(new DOMException('aborted?', 'AbortError'))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    // AbortError from cancellation surfaces as unavailable only when it is a real failure;
    // TanStack treats cancellations as cancelled, so use a plain network error here.
    fetchMock.mockRejectedValue(new TypeError('network down'))
    renderProbe(client, { artifactId: ART_A, versionId: VER_A1 })

    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe('settled'),
    )
    const errorText = screen.getByTestId('error').textContent ?? ''
    expect(errorText.length).toBeGreaterThan(0)
    expect(errorText).not.toContain('network down')
  })

  it('rejects non-text content instead of reading extracted text', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"extractedText":"should never surface"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    renderProbe(client, { artifactId: ART_A, versionId: VER_A1 })

    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe('settled'),
    )
    expect(screen.getByTestId('source').textContent).toBe('empty')
    expect(document.body.textContent ?? '').not.toContain(
      'should never surface',
    )
    expect(
      (screen.getByTestId('error').textContent ?? '').length,
    ).toBeGreaterThan(0)
  })

  it('recovers through refetch after a failure', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response('nope', {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(textResponse('# Recovered'))
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    renderProbe(client, { artifactId: ART_A, versionId: VER_A1 })

    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe('settled'),
    )
    expect(screen.getByTestId('source').textContent).toBe('empty')

    screen.getByTestId('retry').click()
    await waitFor(() =>
      expect(screen.getByTestId('source').textContent).toBe('# Recovered'),
    )
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cancels the obsolete request when ids change', async () => {
    let resolveFirst: (value: Response) => void = () => {}
    const firstPromise = new Promise<Response>((resolve) => {
      resolveFirst = resolve
    })
    fetchMock
      .mockImplementationOnce(() => firstPromise)
      .mockImplementationOnce(() => Promise.resolve(textResponse('# Second')))

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <Probe artifactId={ART_A} versionId={VER_A1} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const firstSignal = (
      fetchMock.mock.calls[0] as [string, RequestInit]
    )[1].signal

    rerender(
      <QueryClientProvider client={client}>
        <Probe artifactId={ART_A} versionId={VER_A2} />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(firstSignal?.aborted).toBe(true)

    resolveFirst(textResponse('# First late'))
    await waitFor(() =>
      expect(screen.getByTestId('source').textContent).toBe('# Second'),
    )
  })

  it('does not fetch when disabled', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    renderProbe(client, {
      artifactId: ART_A,
      versionId: VER_A1,
      enabled: false,
    })
    await waitFor(() =>
      expect(screen.getByTestId('pending').textContent).toBe('settled'),
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('source').textContent).toBe('empty')
  })
})
