import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationArtifactLayout } from '../../src/components/artifacts/ConversationArtifactLayout'

function DraftInput({ testId }: { testId: string }) {
  const [value, setValue] = useState('')
  return (
    <input
      data-testid={testId}
      aria-label={testId}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

function Harness({ startOpen = false }: { startOpen?: boolean }) {
  const [canvasOpen, setCanvasOpen] = useState(startOpen)
  return (
    <div>
      <button
        type="button"
        data-testid="toggle-canvas"
        onClick={() => setCanvasOpen((open) => !open)}
      >
        toggle
      </button>
      <ConversationArtifactLayout
        canvasOpen={canvasOpen}
        chatPane={
          <div>
            <p data-testid="chat-marker">chat content</p>
            <DraftInput testId="chat-draft" />
            <div data-testid="composer-marker">composer</div>
          </div>
        }
        canvasPane={
          <div>
            <p data-testid="canvas-marker">canvas content</p>
            <DraftInput testId="canvas-draft" />
          </div>
        }
      />
    </div>
  )
}

describe('ConversationArtifactLayout', () => {
  afterEach(cleanup)

  it('keeps both panes mounted when canvas is closed', () => {
    render(<Harness startOpen={false} />)

    expect(screen.getByTestId('chat-marker')).toBeTruthy()
    expect(screen.getByTestId('canvas-marker')).toBeTruthy()
    expect(screen.getByTestId('composer-marker')).toBeTruthy()
    expect(
      screen
        .getByTestId('conversation-artifact-layout')
        .getAttribute('data-canvas-open'),
    ).toBe('false')
    expect(screen.queryByTestId('artifact-layout-separator')).toBeNull()
  })

  it('keeps chat and composer mounted when canvas opens and preserves the chat draft', () => {
    render(<Harness startOpen={false} />)

    fireEvent.change(screen.getByTestId('chat-draft'), {
      target: { value: 'unsent draft' },
    })
    fireEvent.click(screen.getByTestId('toggle-canvas'))

    expect(screen.getByTestId('chat-marker')).toBeTruthy()
    expect(screen.getByTestId('composer-marker')).toBeTruthy()
    expect(screen.getByTestId('canvas-marker')).toBeTruthy()
    expect((screen.getByTestId('chat-draft') as HTMLInputElement).value).toBe(
      'unsent draft',
    )
    expect(
      screen
        .getByTestId('conversation-artifact-layout')
        .getAttribute('data-canvas-open'),
    ).toBe('true')
    expect(screen.getByTestId('artifact-layout-separator')).toBeTruthy()
  })

  it('returns to normal chat on close while preserving drafts on both panes', () => {
    render(<Harness startOpen={true} />)

    fireEvent.change(screen.getByTestId('chat-draft'), {
      target: { value: 'chat draft' },
    })
    fireEvent.change(screen.getByTestId('canvas-draft'), {
      target: { value: 'canvas note' },
    })
    fireEvent.click(screen.getByTestId('toggle-canvas'))

    expect(
      screen
        .getByTestId('conversation-artifact-layout')
        .getAttribute('data-canvas-open'),
    ).toBe('false')
    expect(screen.getByTestId('chat-marker')).toBeTruthy()
    expect(screen.getByTestId('canvas-marker')).toBeTruthy()
    expect((screen.getByTestId('chat-draft') as HTMLInputElement).value).toBe(
      'chat draft',
    )
    expect((screen.getByTestId('canvas-draft') as HTMLInputElement).value).toBe(
      'canvas note',
    )
  })

  it('keeps the composer inside the chat pane, never under the canvas pane', () => {
    render(<Harness startOpen={true} />)

    const chatPane = screen.getByTestId('chat-pane')
    const canvasPane = screen.getByTestId('canvas-pane')
    const composer = screen.getByTestId('composer-marker')

    expect(chatPane.contains(composer)).toBe(true)
    expect(canvasPane.contains(composer)).toBe(false)
  })
})
