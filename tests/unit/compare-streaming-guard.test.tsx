import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompareGrid } from '../../src/components/chat/CompareGrid'
import { ModelColumn } from '../../src/components/chat/ModelColumn'
import { hydrateMessages } from '../../src/lib/utils/conversation-hydration'
import { humanizeGenerationError } from '../../src/lib/utils/error-display'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [
    { id: 'model-a', displayName: 'Model Alpha', creditCost: 1 },
    { id: 'model-b', displayName: 'Model Beta', creditCost: 1 },
    { id: 'model-c', displayName: 'Model Gamma', creditCost: 1 },
    { id: 'model-d', displayName: 'Model Delta', creditCost: 1 },
  ],
  findCatalogEntry: (
    catalog: Array<{ id: string; displayName: string }>,
    id: string,
  ) =>
    catalog.find((m) => m.id === id) ?? {
      id,
      displayName: id,
    },
}))

describe('Compare Streaming Guard & Reasoning Lifecycle', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  // Test 1: reasoning + final text normal
  it('1. handles normal flow: reasoning + final text rendered cleanly as completed', () => {
    const generation = {
      id: 'gen-1',
      modelId: 'model-a',
      status: 'completed',
      content: 'This is the verified final answer.',
      reasoningContent: 'Step 1: Analyzed prompt. Step 2: Formulated answer.',
    }

    render(<ModelColumn generation={generation} />)

    // Reasoning section exists
    expect(screen.getByTestId('reasoning-section')).not.toBeNull()
    // Content exists
    expect(screen.getByText('This is the verified final answer.')).not.toBeNull()
    // No error rendered
    expect(screen.queryByTestId('inline-error')).toBeNull()
  })

  // Test 2: reasoning tanpa final text
  it('2. handles reasoning without final text: preserves reasoning and renders proper error with retry', () => {
    const onRetry = vi.fn()
    const generation = {
      id: 'gen-2',
      modelId: 'model-b',
      status: 'completed',
      content: '', // empty final text
      reasoningContent:
        'Deep thought process completed, but answer was missing.',
    }

    render(<ModelColumn generation={generation} onRetry={onRetry} />)

    // Reasoning must NOT be discarded
    expect(screen.getByTestId('reasoning-section')).not.toBeNull()
    // Proper error must be rendered
    const errorEl = screen.getByTestId('inline-error')
    expect(errorEl).not.toBeNull()
    expect(errorEl.textContent).toContain(
      'Model tidak menghasilkan jawaban akhir',
    )
    // Retry button must be available
    const retryBtn = screen.getByTestId('retry-gen-2')
    expect(retryBtn).not.toBeNull()
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledWith('gen-2')
  })

  // Test 3: final text tanpa reasoning
  it('3. handles final text without reasoning: renders final text without reasoning panel', () => {
    const generation = {
      id: 'gen-3',
      modelId: 'model-c',
      status: 'completed',
      content: 'Direct answer without any reasoning phase.',
      reasoningContent: null,
    }

    render(<ModelColumn generation={generation} />)

    expect(screen.queryByTestId('reasoning-section')).toBeNull()
    expect(
      screen.getByText('Direct answer without any reasoning phase.'),
    ).not.toBeNull()
    expect(screen.queryByTestId('inline-error')).toBeNull()
  })

  // Test 4: provider error setelah reasoning
  it('4. handles provider error after reasoning: keeps reasoning visible and shows error', () => {
    const onRetry = vi.fn()
    const generation = {
      id: 'gen-4',
      modelId: 'model-d',
      status: 'failed',
      content: '',
      reasoningContent: 'Thinking occurred before network socket closed.',
      error: {
        message: 'Provider AI sedang mengalami gangguan.',
        code: 'ERR-001',
      },
    }

    render(<ModelColumn generation={generation} onRetry={onRetry} />)

    // Reasoning must still be visible
    expect(screen.getByTestId('reasoning-section')).not.toBeNull()
    // Error must be displayed
    expect(screen.getByTestId('inline-error')).not.toBeNull()
    // Retry button available
    const retryBtn = screen.getByTestId('retry-gen-4')
    expect(retryBtn).not.toBeNull()
    fireEvent.click(retryBtn)
    expect(onRetry).toHaveBeenCalledWith('gen-4')
  })

  // Test 5: stream interrupted / empty response hydration guard
  it('5. guards against interrupted/empty streams during conversation hydration', () => {
    const persisted = [
      {
        id: 'msg-1',
        role: 'assistant' as const,
        content: '',
        generationRuns: [
          {
            id: 'run-1',
            modelId: 'model-a',
            status: 'completed', // was marked completed despite empty content
            content: '', // empty content
            reasoningContent: 'Some thinking was recorded before crash',
            comparisonRunId: 'comp-1',
            error: null,
          },
        ],
      },
    ]

    const hydrated = hydrateMessages(
      persisted as unknown as Parameters<typeof hydrateMessages>[0],
    )
    const compareGen = hydrated[0]?.compareGenerations?.[0]

    expect(compareGen).toBeDefined()
    // Guard must correct status to failed
    expect(compareGen?.status).toBe('failed')
    expect(compareGen?.reasoningContent).toBe(
      'Some thinking was recorded before crash',
    )
    expect(compareGen?.error).toEqual({
      message: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
      code: 'ERR-001',
    })
  })

  // Test 6: compare 4 model dengan satu model gagal
  it('6. isolates 1 failed model among 4 models in compare mode without breaking others', () => {
    const onRetry = vi.fn()
    const generations = [
      {
        id: 'gen-m1',
        modelId: 'model-a',
        status: 'completed',
        content: 'Model 1 success answer',
      },
      {
        id: 'gen-m2',
        modelId: 'model-b',
        status: 'completed',
        content: '', // Empty final answer -> should fail
        reasoningContent: 'Model 2 thought deeply but produced no answer',
      },
      {
        id: 'gen-m3',
        modelId: 'model-c',
        status: 'completed',
        content: 'Model 3 success answer',
      },
      {
        id: 'gen-m4',
        modelId: 'model-d',
        status: 'completed',
        content: 'Model 4 success answer',
      },
    ]

    render(<CompareGrid generations={generations} onRetry={onRetry} />)

    const columns = screen.getAllByTestId('model-column')
    expect(columns.length).toBe(4)

    // Models 1, 3, 4 show successful answers
    expect(screen.getByText('Model 1 success answer')).not.toBeNull()
    expect(screen.getByText('Model 3 success answer')).not.toBeNull()
    expect(screen.getByText('Model 4 success answer')).not.toBeNull()

    // Model 2 failed gracefully with retry
    expect(screen.getByTestId('retry-gen-m2')).not.toBeNull()
    expect(screen.queryByTestId('retry-gen-m1')).toBeNull()
    expect(screen.queryByTestId('retry-gen-m3')).toBeNull()
    expect(screen.queryByTestId('retry-gen-m4')).toBeNull()
  })

  // Test 7: retry triggers isolated re-generation
  it('7. retry triggers onRetry callback exclusively for target generation', () => {
    const onRetry = vi.fn()
    const generation = {
      id: 'gen-target-retry',
      modelId: 'model-a',
      status: 'failed',
      content: '',
      error: {
        message: 'Model tidak menghasilkan jawaban akhir. Coba lagi.',
      },
    }

    render(<ModelColumn generation={generation} onRetry={onRetry} />)

    const btn = screen.getByTestId('retry-gen-target-retry')
    fireEvent.click(btn)

    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(onRetry).toHaveBeenCalledWith('gen-target-retry')
  })

  it('humanizeGenerationError identifies empty-response error correctly', () => {
    const res = humanizeGenerationError(
      'Model tidak menghasilkan jawaban akhir. Coba lagi.',
    )
    expect(res.userMessage).toBe(
      'Model tidak menghasilkan jawaban akhir. Coba lagi.',
    )
  })
})
