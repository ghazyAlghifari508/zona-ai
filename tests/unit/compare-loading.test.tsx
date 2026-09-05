import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompareGrid } from '../../src/components/chat/CompareGrid'
import { ModelColumn } from '../../src/components/chat/ModelColumn'
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
    expect(
      screen.getByText('Model selesai dengan respon final.'),
    ).toBeTruthy()
  })
})