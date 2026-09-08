import type { ArtifactSummary } from '../../lib/artifacts/contracts'

if (typeof window !== 'undefined') {
  throw new Error('src/server/core/artifact-catalog-context.ts is server-only')
}

export function buildArtifactCatalogContext(
  summaries: readonly ArtifactSummary[],
): string {
  if (summaries.length === 0) return ''

  const lines = summaries.map(
    (s) =>
      `- "${s.title}" (${s.kind}, v${s.currentVersion}, file: ${s.fileName}) [ID: ${s.artifactId}]`,
  )

  return [
    'The following artifacts currently exist in this conversation:',
    ...lines,
    '',
    'If the user is asking to view, update, revise, or reference an existing artifact, instruct them to explicitly select it with @ in their prompt.',
  ].join('\n')
}
