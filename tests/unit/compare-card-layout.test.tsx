import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompareGrid } from '../../src/components/chat/CompareGrid'
import { ModelColumn } from '../../src/components/chat/ModelColumn'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [
    {
      id: 'gemini-3.7-flash-high',
      displayName: 'Gemini 3.7 Flash',
      creditCost: 1,
    },
    { id: 'gpt-5.6-sol', displayName: 'GPT 5.6 Sol', creditCost: 1 },
    { id: 'qwen3.8-flash', displayName: 'Qwen 3.8 Flash', creditCost: 1 },
    { id: 'mimo-v2.5', displayName: 'MiMo V2.5', creditCost: 1 },
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

describe('Compare Card Layout: Fixed Header and Scrollable Content', () => {
  afterEach(cleanup)

  it('renders fixed header and scrollable content as separate sibling containers', () => {
    const generation = {
      id: 'gen-1',
      modelId: 'gemini-3.7-flash-high',
      status: 'completed',
      content: 'Short response',
    }

    render(<ModelColumn generation={generation} />)

    const card = screen.getByTestId('model-column')
    const header = screen.getByTestId('model-column-header')
    const content = screen.getByTestId('model-column-content')

    // Both must be direct children of the card
    expect(card.contains(header)).toBe(true)
    expect(card.contains(content)).toBe(true)
    expect(header.parentElement).toBe(card)
    expect(content.parentElement).toBe(card)
    // Header must NOT be inside content container
    expect(content.contains(header)).toBe(false)
  })

  it('keeps header controls outside of the scrollable content area', () => {
    const generation = {
      id: 'gen-2',
      modelId: 'gpt-5.6-sol',
      status: 'completed',
      content: 'Sample response text',
    }

    render(<ModelColumn generation={generation} />)

    const header = screen.getByTestId('model-column-header')
    const content = screen.getByTestId('model-column-content')
    const copyBtn = screen.getByTestId('copy-gen-2')

    expect(header.contains(copyBtn)).toBe(true)
    expect(content.contains(copyBtn)).toBe(false)
  })

  it('renders reasoning section inside the scrollable content area', () => {
    const generation = {
      id: 'gen-reasoning',
      modelId: 'gemini-3.7-flash-high',
      status: 'completed',
      content: 'Final answer',
      reasoningContent: 'Step-by-step thinking process',
    }

    render(<ModelColumn generation={generation} />)

    const content = screen.getByTestId('model-column-content')
    const reasoning = screen.getByTestId('reasoning-section')
    const toggle = screen.getByTestId('reasoning-toggle')

    expect(content.contains(reasoning)).toBe(true)

    // Expand reasoning and verify expanded panel is also inside the scrollable content container
    fireEvent.click(toggle)
    const panel = screen.getByTestId('reasoning-panel')
    expect(content.contains(panel)).toBe(true)
    expect(panel.textContent).toContain('Step-by-step thinking process')
  })

  it('renders 2 models with short responses in independent columns', () => {
    const generations = [
      {
        id: 'gen-a',
        modelId: 'gemini-3.7-flash-high',
        status: 'completed',
        content: 'Short A',
      },
      {
        id: 'gen-b',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content: 'Short B',
      },
    ]

    render(<CompareGrid generations={generations} />)

    const columns = screen.getAllByTestId('model-column')
    const contents = screen.getAllByTestId('model-column-content')
    expect(columns.length).toBe(2)
    expect(contents.length).toBe(2)
  })

  it('renders 4 models with varying response lengths with independent scroll areas', () => {
    const generations = [
      {
        id: 'gen-1',
        modelId: 'gemini-3.7-flash-high',
        status: 'completed',
        content: 'Short response',
      },
      {
        id: 'gen-2',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content:
          'Paragraph 1\n\nParagraph 2\n\nParagraph 3\n\nParagraph 4\n\nParagraph 5',
      },
      {
        id: 'gen-3',
        modelId: 'qwen3.8-flash',
        status: 'completed',
        content: 'Moderate response length here',
      },
      {
        id: 'gen-4',
        modelId: 'mimo-v2.5',
        status: 'completed',
        content:
          'Another long detailed explanation with multiple paragraphs and code blocks',
      },
    ]

    render(<CompareGrid generations={generations} />)

    const columns = screen.getAllByTestId('model-column')
    const headers = screen.getAllByTestId('model-column-header')
    const contents = screen.getAllByTestId('model-column-content')

    expect(columns.length).toBe(4)
    expect(headers.length).toBe(4)
    expect(contents.length).toBe(4)

    // Each content area has its own text
    expect(contents[0].textContent).toContain('Short response')
    expect(contents[1].textContent).toContain('Paragraph 1')
    expect(contents[2].textContent).toContain('Moderate response')
    expect(contents[3].textContent).toContain('Another long detailed')
  })

  it('renders user prompt alongside CompareGrid without breaking grid columns', () => {
    const generations = [
      {
        id: 'gen-prompt-1',
        modelId: 'gemini-3.7-flash-high',
        status: 'completed',
        content: 'Model A answer',
      },
      {
        id: 'gen-prompt-2',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content: 'Model B answer',
      },
    ]

    render(
      <CompareGrid
        generations={generations}
        userPrompt="Compare PostgreSQL vs MySQL"
      />,
    )

    expect(screen.getByText('Compare PostgreSQL vs MySQL')).toBeTruthy()
    const columns = screen.getAllByTestId('model-column')
    expect(columns.length).toBe(2)
  })

  it('assigns compact width variant to short responses like "42" and 1-2 sentences', () => {
    const shortGen = {
      id: 'gen-short-1',
      modelId: 'gemini-3.7-flash-high',
      status: 'completed',
      content: '42',
    }

    render(<ModelColumn generation={shortGen} />)
    const card = screen.getByTestId('model-column')
    expect(card.getAttribute('data-width-variant')).toBe('compact')
  })

  it('assigns expanded width variant to long responses or code blocks', () => {
    const longGen = {
      id: 'gen-long-1',
      modelId: 'gpt-5.6-sol',
      status: 'completed',
      content:
        'Penjelasan detail arsitektur aplikasi TanStack Start dengan Drizzle ORM dan PostgreSQL, dilengkapi sistem multi-model streaming yang mendukung berbagai provider proxy lokal dan eksternal secara aman, modular, dan terstruktur.',
    }

    render(<ModelColumn generation={longGen} />)
    const card = screen.getByTestId('model-column')
    expect(card.getAttribute('data-width-variant')).toBe('expanded')
  })

  it('allows independent width variants for multiple models side-by-side', () => {
    const generations = [
      {
        id: 'gen-compact',
        modelId: 'gemini-3.7-flash-high',
        status: 'completed',
        content: '42',
      },
      {
        id: 'gen-expanded',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content:
          'Berikut adalah analisis komparatif mendalam mengenai perbedaan performa konkurensi antara PostgreSQL pgvector dan dedicated vector database dalam skenario beban produksi tinggi dengan jutaan record embedding.',
      },
    ]

    render(<CompareGrid generations={generations} />)
    const columns = screen.getAllByTestId('model-column')
    expect(columns.length).toBe(2)
    expect(columns[0].getAttribute('data-width-variant')).toBe('compact')
    expect(columns[1].getAttribute('data-width-variant')).toBe('expanded')
  })

  it('latches to expanded width during streaming and does not revert to compact', () => {
    const { rerender } = render(
      <ModelColumn
        generation={{
          id: 'gen-stream-1',
          modelId: 'gemini-3.7-flash-high',
          status: 'streaming',
          content: 'Hai',
        }}
      />,
    )

    const card = screen.getByTestId('model-column')
    expect(card.getAttribute('data-width-variant')).toBe('compact')

    // Stream content grows past threshold -> transitions to expanded
    rerender(
      <ModelColumn
        generation={{
          id: 'gen-stream-1',
          modelId: 'gemini-3.7-flash-high',
          status: 'streaming',
          content:
            'Penjelasan detail arsitektur aplikasi TanStack Start dengan Drizzle ORM dan PostgreSQL, dilengkapi sistem multi-model streaming yang mendukung berbagai provider proxy lokal dan eksternal secara aman, modular, dan terstruktur.',
        }}
      />,
    )
    expect(card.getAttribute('data-width-variant')).toBe('expanded')

    // Temporary shorter content or stream completion does NOT revert to compact
    rerender(
      <ModelColumn
        generation={{
          id: 'gen-stream-1',
          modelId: 'gemini-3.7-flash-high',
          status: 'completed',
          content: 'Selesai.',
        }}
      />,
    )
    expect(card.getAttribute('data-width-variant')).toBe('expanded')
  })
})
