import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArtifactProgress } from '../../src/components/chat/ArtifactProgress'
import { FileCard } from '../../src/components/chat/FileCard'

describe('ArtifactProgress', () => {
  afterEach(() => {
    cleanup()
  })

  it.each([
    ['prd', 'preparing'],
    ['prd', 'generating'],
    ['prd', 'validating'],
    ['prd', 'creating_file'],
    ['agent-skill', 'preparing'],
    ['agent-skill', 'generating'],
    ['agent-skill', 'validating'],
    ['agent-skill', 'creating_file'],
  ] as const)(
    'renders live phase %s/%s with progress marker',
    (kind, phase) => {
      render(<ArtifactProgress kind={kind} phase={phase} />)
      const root = screen.getByTestId('artifact-progress')
      expect(root.getAttribute('data-phase')).toBe(phase)
      expect(
        screen.getByTestId('artifact-progress-text').textContent?.length,
      ).toBeGreaterThan(0)
    },
  )

  it('renders completed and error states', () => {
    const { unmount } = render(
      <ArtifactProgress kind="prd" phase="completed" />,
    )
    expect(
      screen.getByTestId('artifact-progress').getAttribute('data-phase'),
    ).toBe('completed')
    unmount()
    render(
      <ArtifactProgress kind="agent-skill" phase="error" errorMessage="boom" />,
    )
    expect(screen.getByTestId('artifact-progress-text').textContent).toContain(
      'boom',
    )
  })
})

describe('FileCard', () => {
  afterEach(() => {
    cleanup()
  })

  it('links to the authenticated download endpoint with filename', () => {
    render(
      <FileCard
        artifact={{
          kind: 'agent-skill',
          attachmentId: '11111111-1111-4111-8111-111111111111',
          fileName: 'frontend-design.md',
          fileSize: 2048,
          mimeType: 'text/markdown',
        }}
      />,
    )
    expect(screen.getByTestId('artifact-file-card')).toBeTruthy()
    expect(screen.getByTestId('artifact-file-name').textContent).toBe(
      'frontend-design.md',
    )
    const link = screen.getByTestId('artifact-download-btn')
    expect(link.getAttribute('href')).toBe(
      '/api/attachments/11111111-1111-4111-8111-111111111111?download=1',
    )
    expect(link.getAttribute('download')).toBe('frontend-design.md')
  })
})
