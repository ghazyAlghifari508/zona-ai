import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArtifactMentionTokens } from '../../src/components/artifacts/ArtifactMentionTokens'
import type { SafeArtifactMention } from '../../src/lib/artifacts/mentions'

const mockMentions: SafeArtifactMention[] = [
  {
    artifactId: '10000000-0000-4000-8000-000000000001',
    versionId: '10000000-0000-4000-8000-000000000002',
    mode: 'context',
    position: 0,
    title: 'Alpha PRD',
    kind: 'prd',
    version: 1,
  },
  {
    artifactId: '20000000-0000-4000-8000-000000000001',
    versionId: '20000000-0000-4000-8000-000000000002',
    mode: 'revise',
    position: 1,
    title: 'Beta Checklist',
    kind: 'checklist',
    version: 2,
  },
]

describe('ArtifactMentionTokens component', () => {
  afterEach(cleanup)

  it('renders nothing when mentions array is empty', () => {
    const { container } = render(<ArtifactMentionTokens mentions={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders historical mention tokens with snapshot metadata', () => {
    render(<ArtifactMentionTokens mentions={mockMentions} />)

    expect(screen.getByText('@Alpha PRD')).toBeDefined()
    expect(screen.getByText('@Beta Checklist')).toBeDefined()
    expect(screen.getByText('context')).toBeDefined()
    expect(screen.getByText('revise')).toBeDefined()
  })

  it('calls onOpenArtifact with exact artifactId and versionId on click', () => {
    const onOpenArtifact = vi.fn()
    render(
      <ArtifactMentionTokens
        mentions={mockMentions}
        onOpenArtifact={onOpenArtifact}
      />,
    )

    const token = screen.getByTestId(
      `mention-token-${mockMentions[0].artifactId}`,
    )
    fireEvent.click(token)

    expect(onOpenArtifact).toHaveBeenCalledWith({
      artifactId: mockMentions[0].artifactId,
      versionId: mockMentions[0].versionId,
    })
  })
})
