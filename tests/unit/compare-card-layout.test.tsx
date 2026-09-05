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

  it('renders 3 models in independent columns with headers and content', () => {
    const generations = [
      {
        id: 'gen-1',
        modelId: 'gemini-3.7-flash-high',
        status: 'completed',
        content: 'Response 1',
      },
      {
        id: 'gen-2',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content: 'Response 2',
      },
      {
        id: 'gen-3',
        modelId: 'qwen3.8-flash',
        status: 'completed',
        content: 'Response 3',
      },
    ]

    render(<CompareGrid generations={generations} />)

    const columns = screen.getAllByTestId('model-column')
    const headers = screen.getAllByTestId('model-column-header')
    const contents = screen.getAllByTestId('model-column-content')

    expect(columns.length).toBe(3)
    expect(headers.length).toBe(3)
    expect(contents.length).toBe(3)
    expect(contents[0].textContent).toContain('Response 1')
    expect(contents[1].textContent).toContain('Response 2')
    expect(contents[2].textContent).toContain('Response 3')
  })
})
