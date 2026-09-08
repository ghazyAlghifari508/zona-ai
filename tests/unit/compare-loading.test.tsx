import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompareGrid } from '../../src/components/chat/CompareGrid'
import { ModelColumn } from '../../src/components/chat/ModelColumn'
import type { ArtifactDescriptor } from '../../src/lib/artifacts/contracts'
import { getModelCatalog as getRealModelCatalog } from '../../src/lib/models/registry'

vi.mock('../../src/server/functions/models', () => ({
  getModelCatalog: vi.fn(async () => getRealModelCatalog()),
}))

describe('Compare Mode loading indicator (TypingDots)', () => {
  afterEach(cleanup)

  it('renders typing dots when model is streaming and content is empty', () => {
    const generation = {
      id: 'gen-1',
      modelId: 'mimo-v2.5',
      status: 'streaming',
      content: '',
    }

    render(<ModelColumn generation={generation} />)

    expect(screen.getByTestId('typing-dots')).toBeTruthy()
    expect(screen.getByLabelText('Sedang menulis')).toBeTruthy()
  })

  it('renders typing dots when model is queued and content is empty', () => {
    const generation = {
      id: 'gen-2',
      modelId: 'hy3',
      status: 'queued',
      content: '',
    }

    render(<ModelColumn generation={generation} />)

    expect(screen.getByTestId('typing-dots')).toBeTruthy()
  })

  it('renders typing dots when content is whitespace only', () => {
    const generation = {
      id: 'gen-ws',
      modelId: 'mimo-v2.5',
      status: 'streaming',
      content: '   \n  ',
    }

    render(<ModelColumn generation={generation} />)

    expect(screen.getByTestId('typing-dots')).toBeTruthy()
  })

  it('hides typing dots and renders markdown when first text token arrives', () => {
    const generation = {
      id: 'gen-3',
      modelId: 'gpt-5.6-sol',
      status: 'streaming',
      content: 'Halo, saya GPT!',
    }

    render(<ModelColumn generation={generation} />)

    expect(screen.queryByTestId('typing-dots')).toBeNull()
    expect(screen.getByText('Halo, saya GPT!')).toBeTruthy()
  })

  it('hides typing dots when generation status is completed', () => {
    const generation = {
      id: 'gen-4',
      modelId: 'gemini-3.7-flash-high',
      status: 'completed',
      content: 'Jawaban final lengkap.',
    }

    render(<ModelColumn generation={generation} />)

    expect(screen.queryByTestId('typing-dots')).toBeNull()
    expect(screen.getByText('Jawaban final lengkap.')).toBeTruthy()
  })

  it('hides typing dots and shows error state when generation fails', () => {
    const generation = {
      id: 'gen-5',
      modelId: 'qwen3.8-flash',
      status: 'failed',
      content: '',
      error: { message: 'Koneksi terputus', code: 'ERR-001' },
    }

    render(<ModelColumn generation={generation} onRetry={vi.fn()} />)

    expect(screen.queryByTestId('typing-dots')).toBeNull()
    expect(screen.getByTestId('inline-error')).toBeTruthy()
    expect(screen.getByTestId('retry-gen-5')).toBeTruthy()
  })

  it('hides typing dots when generation is cancelled', () => {
    const generation = {
      id: 'gen-6',
      modelId: 'glm-5.3-flash',
      status: 'cancelled',
      content: '',
    }

    render(<ModelColumn generation={generation} />)

    expect(screen.queryByTestId('typing-dots')).toBeNull()
  })

  it('shows reasoning toggle AND typing dots when reasoning content exists but text is empty', () => {
    const generation = {
      id: 'gen-7',
      modelId: 'hy3',
      status: 'streaming',
      content: '',
      reasoningContent: 'Sedang memikirkan langkah-langkah solusi...',
    }

    render(<ModelColumn generation={generation} />)

    // Reasoning toggle is visible
    expect(screen.getByTestId('reasoning-toggle')).toBeTruthy()
    // Typing dots are STILL visible for incoming text content
    expect(screen.getByTestId('typing-dots')).toBeTruthy()
  })

  it('maintains independent loading states for 4 parallel models in CompareGrid', () => {
    const generations = [
      {
        id: 'gen-fast',
        modelId: 'gemini-3.7-flash-high',
        status: 'streaming',
        content: 'Model cepat sedang streaming respon...',
      },
      {
        id: 'gen-slow',
        modelId: 'mimo-v2.5',
        status: 'streaming',
        content: '',
      },
      {
        id: 'gen-err',
        modelId: 'hy3',
        status: 'failed',
        content: '',
        error: { message: 'Rate limit exceeded', code: 'ERR-002' },
      },
      {
        id: 'gen-done',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content: 'Model selesai dengan respon final.',
      },
    ]

    render(
      <CompareGrid
        generations={generations}
        onRetry={vi.fn()}
        onStop={vi.fn()}
        userPrompt="Jelaskan perbedaan arsitektur microservices"
      />,
    )

    // Only 1 typing dots indicator should exist (for the slow model)
    const dots = screen.getAllByTestId('typing-dots')
    expect(dots.length).toBe(1)

    // Fast model shows text
    expect(
      screen.getByText('Model cepat sedang streaming respon...'),
    ).toBeTruthy()

    // Error model shows error state
    expect(screen.getByTestId('inline-error')).toBeTruthy()

    // Done model shows final text
    expect(screen.getByText('Model selesai dengan respon final.')).toBeTruthy()
  })
})

const ART_A = '11111111-1111-4111-8111-111111111111'
const ART_B = '22222222-2222-4222-8222-222222222222'

function compareDescriptor(
  artifactId: string,
  fileName: string,
): ArtifactDescriptor {
  return {
    artifactId,
    versionId: 'a0000000-0000-4000-8000-000000000001',
    attachmentId: 'aaaaaaaa-0000-4000-8000-000000000001',
    generationId: '88888888-8888-4888-8888-888888888888',
    kind: 'prd',
    title: fileName,
    fileName,
    fileSize: 1024,
    mimeType: 'text/markdown',
    version: 1,
    modelId: 'model-a',
    routerModelId: 'router-a',
  }
}

describe('CompareGrid artifact cards and Open All', () => {
  afterEach(cleanup)

  it('opens the exact descriptor when a successful generation card is clicked', () => {
    const artifact = compareDescriptor(ART_A, 'alpha.md')
    const onOpenArtifact = vi.fn()
    render(
      <CompareGrid
        generations={[
          {
            id: 'gen-1',
            modelId: 'mimo-v2.5',
            status: 'completed',
            content: 'Ringkasan.',
            artifact,
          },
        ]}
        onOpenArtifact={onOpenArtifact}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /alpha\.md/ }))

    expect(onOpenArtifact).toHaveBeenCalledTimes(1)
    expect(onOpenArtifact.mock.calls[0]?.[0]).toBe(artifact)
  })

  it('passes only successful descriptors to Open All and keeps failed errors', () => {
    const first = compareDescriptor(ART_A, 'alpha.md')
    const second = compareDescriptor(ART_B, 'beta.md')
    const onOpenArtifacts = vi.fn()
    render(
      <CompareGrid
        generations={[
          {
            id: 'gen-1',
            modelId: 'mimo-v2.5',
            status: 'completed',
            content: 'Ringkasan.',
            artifact: first,
          },
          {
            id: 'gen-2',
            modelId: 'hy3',
            status: 'failed',
            content: '',
            error: { message: 'Rate limit exceeded', code: 'ERR-002' },
          },
          {
            id: 'gen-3',
            modelId: 'gpt-5.6-sol',
            status: 'completed',
            content: 'Ringkasan.',
            artifact: second,
          },
        ]}
        onOpenArtifacts={onOpenArtifacts}
      />,
    )

    fireEvent.click(screen.getByTestId('compare-open-all'))

    expect(onOpenArtifacts).toHaveBeenCalledTimes(1)
    expect(onOpenArtifacts.mock.calls[0]?.[0]).toEqual([first, second])
    expect(screen.getByTestId('inline-error')).toBeTruthy()
  })

  it('hides Open All when no generation produced an artifact', () => {
    render(
      <CompareGrid
        generations={[
          {
            id: 'gen-1',
            modelId: 'mimo-v2.5',
            status: 'completed',
            content: 'Jawaban biasa.',
          },
        ]}
        onOpenArtifacts={vi.fn()}
      />,
    )

    expect(screen.queryByTestId('compare-open-all')).toBeNull()
  })

  it('hides Open All when no open-all handler is provided', () => {
    const artifact = compareDescriptor(ART_A, 'alpha.md')
    const onOpenArtifact = vi.fn()
    render(
      <CompareGrid
        generations={[
          {
            id: 'gen-1',
            modelId: 'mimo-v2.5',
            status: 'completed',
            content: 'Ringkasan.',
            artifact,
          },
        ]}
        onOpenArtifact={onOpenArtifact}
      />,
    )

    expect(screen.queryByTestId('compare-open-all')).toBeNull()
    expect(screen.getByRole('button', { name: /alpha\.md/ })).toBeTruthy()
  })
})
