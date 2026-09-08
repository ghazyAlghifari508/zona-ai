import { useQuery } from '@tanstack/react-query'

export function artifactContentUrl(
  artifactId: string,
  versionId: string,
): string {
  return `/api/artifacts/${artifactId}/versions/${versionId}`
}

export function artifactContentQueryKey(
  artifactId: string,
  versionId: string,
): [string, string, string] {
  return ['artifact-content', artifactId, versionId]
}

export type UseArtifactContentInput = {
  artifactId: string
  versionId: string
  enabled?: boolean
}

export type UseArtifactContentResult = {
  source: string | undefined
  isPending: boolean
  error: string | null
  refetch: () => void
}

const GENERIC_UNAVAILABLE = 'Artifact content is unavailable. Try again.'

function safeMessageForStatus(status: number): string {
  if (status === 401) return 'You need to sign in to view this artifact.'
  if (status === 403) return 'You do not have access to this artifact.'
  if (status === 404) return 'This artifact version was not found.'
  return GENERIC_UNAVAILABLE
}

async function fetchArtifactVersionContent(input: {
  artifactId: string
  versionId: string
  signal: AbortSignal
}): Promise<string> {
  let response: Response
  try {
    response = await fetch(
      artifactContentUrl(input.artifactId, input.versionId),
      { signal: input.signal, headers: { Accept: 'text/markdown' } },
    )
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw error
    throw new Error(GENERIC_UNAVAILABLE)
  }
  if (!response.ok) throw new Error(safeMessageForStatus(response.status))
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('text/')) {
    throw new Error(GENERIC_UNAVAILABLE)
  }
  return response.text()
}

export function useArtifactContent({
  artifactId,
  versionId,
  enabled = true,
}: UseArtifactContentInput): UseArtifactContentResult {
  const isEnabled = enabled && artifactId.length > 0 && versionId.length > 0
  const query = useQuery({
    queryKey: artifactContentQueryKey(artifactId, versionId),
    queryFn: ({ signal }) =>
      fetchArtifactVersionContent({ artifactId, versionId, signal }),
    enabled: isEnabled,
    staleTime: 60_000,
    retry: false,
  })
  return {
    source: query.data,
    isPending: query.isPending && query.fetchStatus !== 'idle',
    error:
      query.error instanceof Error
        ? query.error.message
        : query.error
          ? GENERIC_UNAVAILABLE
          : null,
    refetch: () => {
      void query.refetch()
    },
  }
}
