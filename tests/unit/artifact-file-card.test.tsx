import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileCard } from '../../src/components/chat/FileCard'
import type { ArtifactDescriptor } from '../../src/lib/artifacts/contracts'

const ARTIFACT_ID = '11111111-1111-4111-8111-111111111111'
const VERSION_ID = 'a0000000-0000-4000-8000-000000000001'
const ATTACHMENT_ID = 'aaaaaaaa-0000-4000-8000-000000000001'
const GENERATION_ID = '88888888-8888-4888-8888-888888888888'

const descriptor: ArtifactDescriptor = {
  artifactId: ARTIFACT_ID,
  versionId: VERSION_ID,
  attachmentId: ATTACHMENT_ID,
  generationId: GENERATION_ID,
  kind: 'prd',
  title: 'Launch PRD',
  fileName: 'launch-prd.md',
  fileSize: 2048,
  mimeType: 'text/markdown',
  version: 1,
  modelId: 'model-a',
  routerModelId: 'router-a',
}

describe('FileCard open/download separation', () => {
  afterEach(cleanup)

  it('calls onOpen with the exact descriptor when the card content is clicked', () => {
    const onOpen = vi.fn()
    render(<FileCard artifact={descriptor} onOpen={onOpen} />)

    fireEvent.click(screen.getByRole('button', { name: /launch-prd\.md/ }))

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0]?.[0]).toBe(descriptor)
  })

  it('does not call onOpen when Download is clicked', () => {
    const onOpen = vi.fn()
    render(<FileCard artifact={descriptor} onOpen={onOpen} />)

    const download = screen.getByRole('link', { name: /Download/ })
    download.addEventListener('click', (event) => event.preventDefault(), {
      once: true,
    })
    fireEvent.click(download)

    expect(onOpen).not.toHaveBeenCalled()
  })

  it.each(['Enter', ' '])('opens the card with the %j key', (key) => {
    const onOpen = vi.fn()
    render(<FileCard artifact={descriptor} onOpen={onOpen} />)

    const openControl = screen.getByRole('button', { name: /launch-prd\.md/ })
    openControl.focus()
    expect(document.activeElement).toBe(openControl)
    fireEvent.keyDown(openControl, { key })

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onOpen.mock.calls[0]?.[0]).toBe(descriptor)
  })

  it('renders download without an open control when no onOpen is provided', () => {
    render(
      <FileCard
        artifact={{
          kind: 'prd',
          attachmentId: ATTACHMENT_ID,
          fileName: 'legacy.md',
          fileSize: 512,
          mimeType: 'text/markdown',
        }}
      />,
    )

    expect(screen.getByText('legacy.md')).toBeTruthy()
    expect(screen.getByRole('link', { name: /Download/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /legacy\.md/ })).toBeNull()
  })
})
