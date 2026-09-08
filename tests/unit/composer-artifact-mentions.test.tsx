import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Composer } from '../../src/components/chat/Composer'
import type { ArtifactSummary } from '../../src/lib/artifacts/contracts'

const mockArtifactSummary: ArtifactSummary = {
  artifactId: '10000000-0000-4000-8000-000000000001',
  kind: 'prd',
  title: 'Feature PRD',
  attachmentId: '20000000-0000-4000-8000-000000000002',
  fileName: 'feature-prd.md',
  fileSize: 200,
  mimeType: 'text/markdown',
  modelId: 'gpt-5.6-sol',
  routerModelId: 'openai/gpt-4o',
  currentVersionId: '30000000-0000-4000-8000-000000000003',
  currentVersion: 1,
  versionCount: 1,
  updatedAt: new Date('2026-09-08T00:00:00Z'),
}

describe('Composer artifact mentions', () => {
  afterEach(cleanup)

  it('submits empty artifactMentions array when none are selected', () => {
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)

    const textarea = screen.getByTestId('composer-input')
    fireEvent.change(textarea, { target: { value: 'Hello world' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith(
      'Hello world',
      expect.any(String),
      expect.any(String),
      [],
      false,
      [],
    )
  })

  it('opens mention picker on @ and selects an artifact chip', () => {
    const onSend = vi.fn()
    render(
      <Composer
        onSend={onSend}
        availableArtifacts={[mockArtifactSummary]}
      />,
    )

    const textarea = screen.getByTestId('composer-input')
    // Type "@"
    fireEvent.change(textarea, { target: { value: 'Review @', selectionStart: 8, selectionEnd: 8 } })

    // Picker should be visible
    expect(screen.getByTestId('artifact-mention-picker')).toBeDefined()
    expect(screen.getByText('Feature PRD')).toBeDefined()

    // Select the option
    fireEvent.click(screen.getByText('Feature PRD'))

    // Picker closes, chip appears
    expect(screen.queryByTestId('artifact-mention-picker')).toBeNull()
    expect(screen.getByTestId('artifact-mention-chips')).toBeDefined()
    expect(screen.getByText('@Feature PRD')).toBeDefined()

    // Submit sends the selected mention
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })
    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith(
      'Review',
      expect.any(String),
      expect.any(String),
      [],
      false,
      [
        {
          artifactId: mockArtifactSummary.artifactId,
          versionId: mockArtifactSummary.currentVersionId,
          mode: 'context',
        },
      ],
    )
  })

  it('renders clean mention chip without manual mode toggle button', () => {
    const onSend = vi.fn()
    render(
      <Composer
        onSend={onSend}
        availableArtifacts={[mockArtifactSummary]}
      />,
    )

    const textarea = screen.getByTestId('composer-input')
    fireEvent.change(textarea, { target: { value: '@', selectionStart: 1, selectionEnd: 1 } })
    fireEvent.click(screen.getByText('Feature PRD'))

    // Chip should exist with title and version
    expect(screen.getByText('@Feature PRD')).toBeDefined()
    expect(screen.getByText('v1')).toBeDefined()

    // Mode toggle button should NOT exist
    expect(screen.queryByRole('button', { name: /Ganti mode mention/i })).toBeNull()

    fireEvent.change(textarea, { target: { value: 'Diskusikan dokumen' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSend).toHaveBeenCalledWith(
      'Diskusikan dokumen',
      expect.any(String),
      expect.any(String),
      [],
      false,
      [
        {
          artifactId: mockArtifactSummary.artifactId,
          versionId: mockArtifactSummary.currentVersionId,
          mode: 'context',
        },
      ],
    )
  })

  it('removes mention chip when remove button is clicked', () => {
    render(
      <Composer
        onSend={vi.fn()}
        availableArtifacts={[mockArtifactSummary]}
      />,
    )

    const textarea = screen.getByTestId('composer-input')
    fireEvent.change(textarea, { target: { value: '@', selectionStart: 1, selectionEnd: 1 } })
    fireEvent.click(screen.getByText('Feature PRD'))

    const removeBtn = screen.getByRole('button', { name: /Hapus mention/i })
    fireEvent.click(removeBtn)

    expect(screen.queryByTestId('artifact-mention-chips')).toBeNull()
  })
})
