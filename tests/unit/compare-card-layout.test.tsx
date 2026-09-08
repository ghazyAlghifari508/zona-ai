import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CompareGrid } from '../../src/components/chat/CompareGrid'
import {
  type ChatMessage,
  MessageList,
} from '../../src/components/chat/MessageList'
import { ModelColumn } from '../../src/components/chat/ModelColumn'

vi.mock('../../src/components/chat/useModelCatalog', () => ({
  useModelCatalog: () => [
    {
      id: 'gemini-3.7-flash-high',
      displayName: 'Gemini 3.7 Flash',
      provider: 'antigravity',
      vendor: 'Google',
      creditCost: 1,
    },
    {
      id: 'gpt-5.6-sol',
      displayName: 'GPT 5.6 Sol',
      provider: 'codex',
      vendor: 'OpenAI',
      creditCost: 1,
    },
    {
      id: 'qwen3.8-flash',
      displayName: 'Qwen 3.8 Flash',
      provider: 'qwen',
      vendor: 'Qwen',
      creditCost: 1,
    },
    {
      id: 'mimo-v2.5',
      displayName: 'MiMo V2.5',
      provider: 'xiaomi',
      vendor: 'Xiaomi',
      creditCost: 1,
    },
  ],
  findCatalogEntry: (
    catalog: Array<{
      id: string
      displayName: string
      provider?: string
      vendor?: string
    }>,
    id: string,
  ) =>
    catalog.find((m) => m.id === id) ?? {
      id,
      displayName: id,
      provider: 'zona-router',
      vendor: 'Zona',
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

  it('renders user prompt right-aligned in full width container with max-width limit', () => {
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

    const promptText = screen.getByText('Compare PostgreSQL vs MySQL')
    expect(promptText).toBeTruthy()
    expect(promptText.className).toContain('max-w-[min(78%,680px)]')
    const promptRow = promptText.parentElement
    expect(promptRow?.className).toContain('w-full')
    expect(promptRow?.className).toContain('justify-end')
    const columns = screen.getAllByTestId('model-column')
    expect(columns.length).toBe(2)
  })

  it('enforces stable full-width column classes without content-based width variants', () => {
    const shortGen = {
      id: 'gen-short-1',
      modelId: 'gemini-3.7-flash-high',
      status: 'completed',
      content: '42',
    }

    const { unmount } = render(<ModelColumn generation={shortGen} />)
    const cardShort = screen.getByTestId('model-column')
    expect(cardShort.getAttribute('data-width-variant')).toBeNull()
    expect(cardShort.className).toContain('w-full')
    expect(cardShort.className).toContain('min-w-0')
    expect(cardShort.className).toContain('max-w-full')
    unmount()

    const longGen = {
      id: 'gen-long-1',
      modelId: 'gpt-5.6-sol',
      status: 'completed',
      content:
        'Penjelasan detail arsitektur aplikasi TanStack Start dengan Drizzle ORM dan PostgreSQL, dilengkapi sistem multi-model streaming yang mendukung berbagai provider proxy lokal dan eksternal secara aman, modular, dan terstruktur.',
    }

    render(<ModelColumn generation={longGen} />)
    const cardLong = screen.getByTestId('model-column')
    expect(cardLong.getAttribute('data-width-variant')).toBeNull()
    expect(cardLong.className).toContain('w-full')
    expect(cardLong.className).toContain('min-w-0')
    expect(cardLong.className).toContain('max-w-full')
  })

  it('renders 2 models side-by-side in stable 2-column grid', () => {
    const generations = [
      {
        id: 'gen-1',
        modelId: 'gemini-3.7-flash-high',
        status: 'completed',
        content: '42',
      },
      {
        id: 'gen-2',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content: 'Detailed explanation '.repeat(10),
      },
    ]

    render(<CompareGrid generations={generations} />)
    const grid = screen.getByTestId('compare-grid')
    expect(grid.className).toContain('md:grid-cols-2')
    const columns = screen.getAllByTestId('model-column')
    expect(columns.length).toBe(2)
  })

  it('renders 3 models in stable 2-column grid where 3rd card occupies 1 column without stretching', () => {
    const generations = [
      {
        id: 'gen-1',
        modelId: 'gemini-3.7-flash-high',
        status: 'completed',
        content: 'A',
      },
      {
        id: 'gen-2',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content: 'B',
      },
      {
        id: 'gen-3',
        modelId: 'qwen3.8-flash',
        status: 'completed',
        content: 'C',
      },
    ]

    render(<CompareGrid generations={generations} />)
    const grid = screen.getByTestId('compare-grid')
    expect(grid.className).toContain('md:grid-cols-2')
    const columns = screen.getAllByTestId('model-column')
    expect(columns.length).toBe(3)
  })

  it('renders provider name under model name in card header', () => {
    const geminiGen = {
      id: 'gen-gemini',
      modelId: 'gemini-3.7-flash-high',
      status: 'completed',
      content: 'Jawaban Gemini',
    }
    const { unmount } = render(<ModelColumn generation={geminiGen} />)
    const header = screen.getByTestId('model-column-header')
    expect(header.textContent).toContain('Gemini 3.7 Flash')
    expect(header.textContent).toContain('Google')
    unmount()

    const gptGen = {
      id: 'gen-gpt',
      modelId: 'gpt-5.6-sol',
      status: 'completed',
      content: 'Jawaban GPT',
    }
    render(<ModelColumn generation={gptGen} />)
    const headerGpt = screen.getByTestId('model-column-header')
    expect(headerGpt.textContent).toContain('GPT 5.6 Sol')
    expect(headerGpt.textContent).toContain('OpenAI')
  })

  it('applies items-stretch and adaptive min/max height classes to ensure equal height', () => {
    const generations = [
      {
        id: 'gen-short',
        modelId: 'gemini-3.7-flash-high',
        status: 'completed',
        content: 'Pendek',
      },
      {
        id: 'gen-tall',
        modelId: 'gpt-5.6-sol',
        status: 'completed',
        content: 'Jawaban panjang sekali '.repeat(20),
      },
    ]

    render(<CompareGrid generations={generations} />)
    const grid = screen.getByTestId('compare-grid')
    expect(grid.className).toContain('items-stretch')

    const columns = screen.getAllByTestId('model-column')
    for (const col of columns) {
      expect(col.className).toContain('h-full')
      expect(col.className).toContain('min-h-[140px]')
      expect(col.className).toContain('max-h-[640px]')
    }
  })

  it('respects hasUsedCompareMode on MessageList', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'assistant',
        content: 'Jawaban normal',
        modelId: 'gemini-3.7-flash-high',
      },
    ]

    // When hasUsedCompareMode is false: normal chat layout (no model-column card)
    const { unmount, container: containerNormal } = render(
      <MessageList messages={messages} hasUsedCompareMode={false} />,
    )
    expect(screen.queryByTestId('model-column')).toBeNull()
    expect(screen.getByText('Gemini 3.7 Flash')).toBeTruthy()
    expect(screen.getByText('Google')).toBeTruthy()
    const innerNormal = containerNormal.querySelector(
      '[data-testid="message-list"] > div',
    )
    expect(innerNormal?.className).toContain('max-w-[860px]')
    expect(innerNormal?.className).toContain('px-4')
    expect(innerNormal?.className).toContain('lg:px-6')
    unmount()

    // When hasUsedCompareMode is true: compare card layout (model-column card present)
    const { container: containerCompare } = render(
      <MessageList messages={messages} hasUsedCompareMode={true} />,
    )
    expect(screen.getByTestId('model-column')).toBeTruthy()
    const header = screen.getByTestId('model-column-header')
    expect(header.textContent).toContain('Gemini 3.7 Flash')
    expect(header.textContent).toContain('Google')
    const innerCompare = containerCompare.querySelector(
      '[data-testid="message-list"] > div',
    )
    expect(innerCompare?.className).toContain('max-w-[1360px]')
    expect(innerCompare?.className).toContain('px-4')
    expect(innerCompare?.className).toContain('sm:px-6')
    expect(innerCompare?.className).toContain('lg:px-10')
    expect(innerCompare?.className).toContain('xl:px-12')
  })

  it('renders artifact FileCard when compare generation is completed with artifact and empty content', () => {
    const artifactGen = {
      id: 'gen-artifact-1',
      modelId: 'gemini-3.7-flash-high',
      status: 'completed',
      content: '',
      artifact: {
        artifactId: 'art-1',
        versionId: 'ver-1',
        attachmentId: 'att-1',
        generationId: 'gen-artifact-1',
        kind: 'checklist' as const,
        title: 'Compare Checklist Artifact',
        fileName: 'checklist.md',
        fileSize: 128,
        mimeType: 'text/markdown',
        version: 1,
        modelId: 'gemini-3.7-flash-high',
        routerModelId: 'router-1',
      },
    }

    render(<ModelColumn generation={artifactGen} />)
    expect(screen.getByTestId('artifact-file-card')).toBeTruthy()
    expect(screen.queryByRole('note')).toBeNull()
  })
})
