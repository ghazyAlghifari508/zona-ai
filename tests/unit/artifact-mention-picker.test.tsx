import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArtifactMentionPicker } from '../../src/components/artifacts/ArtifactMentionPicker'
import type { ArtifactMentionCandidate } from '../../src/lib/artifacts/mentions'

function mockCandidate(idSuffix: string, title: string): ArtifactMentionCandidate {
  return {
    artifact: {
      artifactId: `10000000-0000-4000-8000-0000000000${idSuffix}`,
      kind: 'prd',
      title,
      attachmentId: `20000000-0000-4000-8000-0000000000${idSuffix}`,
      fileName: `${title.toLowerCase().replace(/\s+/g, '-')}.md`,
      fileSize: 100,
      mimeType: 'text/markdown',
      modelId: 'gemini-3.7-flash-high',
      routerModelId: 'google/gemini-2.5-flash',
      currentVersionId: `30000000-0000-4000-8000-0000000000${idSuffix}`,
      currentVersion: 1,
      versionCount: 1,
      updatedAt: new Date('2026-09-08T00:00:00Z'),
    },
    kindLabel: 'PRD',
    modelDisplayName: 'Gemini 3.7',
  }
}

describe('ArtifactMentionPicker component', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders listbox with accessible options and selection indicator', () => {
    const onSelect = vi.fn()
    const onClose = vi.fn()
    const candidates = [mockCandidate('01', 'Release Plan'), mockCandidate('02', 'Guidelines')]

    render(
      <ArtifactMentionPicker
        candidates={candidates}
        selectedIndex={1}
        onSelect={onSelect}
        onClose={onClose}
      />,
    )

    const listbox = screen.getByRole('listbox', { name: 'Daftar Artifact' })
    expect(listbox).toBeDefined()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[1].getAttribute('aria-selected')).toBe('true')
    expect(options[0].getAttribute('aria-selected')).toBe('false')

    fireEvent.click(options[0])
    expect(onSelect).toHaveBeenCalledWith(candidates[0])
  })

  it('renders empty state when candidates list is empty', () => {
    render(
      <ArtifactMentionPicker
        candidates={[]}
        selectedIndex={0}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    const emptyText = screen.getByText('Tidak ada artifact yang cocok di percakapan ini')
    expect(emptyText).toBeDefined()
  })

  it('calls onClose when clicking Esc button', () => {
    const onClose = vi.fn()
    render(
      <ArtifactMentionPicker
        candidates={[mockCandidate('01', 'Test')]}
        selectedIndex={0}
        onSelect={vi.fn()}
        onClose={onClose}
      />,
    )

    const escButton = screen.getByRole('button', { name: 'Tutup picker' })
    fireEvent.click(escButton)
    expect(onClose).toHaveBeenCalled()
  })
})
