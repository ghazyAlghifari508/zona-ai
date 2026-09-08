import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConversationArtifactLayout } from '../../src/components/artifacts/ConversationArtifactLayout'

describe('ConversationArtifactLayout resizable docked panel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('renders chat and canvas containers with appropriate visibility when closed', () => {
    render(
      <ConversationArtifactLayout
        canvasOpen={false}
        chatPane={<div data-testid="test-chat">Chat Content</div>}
        canvasPane={<div data-testid="test-canvas">Canvas Content</div>}
      />,
    )

    const layout = screen.getByTestId('conversation-artifact-layout')
    expect(layout.getAttribute('data-canvas-open')).toBe('false')

    const chatPane = screen.getByTestId('chat-pane')
    expect(chatPane).toBeTruthy()
    expect(screen.getByTestId('test-chat')).toBeTruthy()

    const canvasPane = screen.getByTestId('canvas-pane')
    expect(canvasPane.className).toContain('hidden')

    expect(screen.queryByTestId('artifact-layout-separator')).toBeNull()
  })

  it('renders resizable separator with role="separator" when canvas is open', () => {
    render(
      <ConversationArtifactLayout
        canvasOpen={true}
        chatPane={<div data-testid="test-chat">Chat Content</div>}
        canvasPane={<div data-testid="test-canvas">Canvas Content</div>}
      />,
    )

    const layout = screen.getByTestId('conversation-artifact-layout')
    expect(layout.getAttribute('data-canvas-open')).toBe('true')

    const separator = screen.getByTestId('artifact-layout-separator')
    expect(separator).toBeTruthy()
    expect(separator.getAttribute('role')).toBe('separator')
    expect(separator.getAttribute('aria-orientation')).toBe('vertical')

    const canvasPane = screen.getByTestId('canvas-pane')
    expect(canvasPane.classList.contains('hidden')).toBe(false)
  })

  it('loads previously stored width from localStorage', () => {
    localStorage.setItem('zona_canvas_width', '620')

    render(
      <ConversationArtifactLayout
        canvasOpen={true}
        chatPane={<div data-testid="test-chat">Chat Content</div>}
        canvasPane={<div data-testid="test-canvas">Canvas Content</div>}
      />,
    )

    const canvasPane = screen.getByTestId('canvas-pane')
    expect(canvasPane.style.width).toBe('620px')
  })

  it('allows resizing canvas using keyboard ArrowLeft and ArrowRight', () => {
    localStorage.setItem('zona_canvas_width', '500')

    render(
      <ConversationArtifactLayout
        canvasOpen={true}
        chatPane={<div data-testid="test-chat">Chat Content</div>}
        canvasPane={<div data-testid="test-canvas">Canvas Content</div>}
      />,
    )

    const separator = screen.getByTestId('artifact-layout-separator')
    const canvasPane = screen.getByTestId('canvas-pane')

    // ArrowLeft widens the canvas (drag left = larger canvas)
    fireEvent.keyDown(separator, { key: 'ArrowLeft' })
    expect(canvasPane.style.width).toBe('520px')
    expect(localStorage.getItem('zona_canvas_width')).toBe('520')

    // ArrowRight shrinks the canvas (drag right = smaller canvas)
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(canvasPane.style.width).toBe('500px')
    expect(localStorage.getItem('zona_canvas_width')).toBe('500')
  })

  it('clamps canvas width to minimum 360px', () => {
    localStorage.setItem('zona_canvas_width', '370')

    render(
      <ConversationArtifactLayout
        canvasOpen={true}
        chatPane={<div data-testid="test-chat">Chat Content</div>}
        canvasPane={<div data-testid="test-canvas">Canvas Content</div>}
      />,
    )

    const separator = screen.getByTestId('artifact-layout-separator')
    const canvasPane = screen.getByTestId('canvas-pane')

    // ArrowRight decreases width; should clamp at 360px
    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(canvasPane.style.width).toBe('360px')

    fireEvent.keyDown(separator, { key: 'ArrowRight' })
    expect(canvasPane.style.width).toBe('360px')
  })

  it('resizes canvas on pointer drag and saves to localStorage', () => {
    localStorage.setItem('zona_canvas_width', '500')

    const { container } = render(
      <ConversationArtifactLayout
        canvasOpen={true}
        chatPane={<div data-testid="test-chat">Chat Content</div>}
        canvasPane={<div data-testid="test-canvas">Canvas Content</div>}
      />,
    )

    const layout = container.querySelector(
      '[data-testid="conversation-artifact-layout"]',
    ) as HTMLElement
    layout.getBoundingClientRect = () =>
      ({
        width: 1000,
        height: 800,
        left: 0,
        right: 1000,
        top: 0,
        bottom: 800,
      }) as DOMRect

    const separator = screen.getByTestId('artifact-layout-separator')
    const canvasPane = screen.getByTestId('canvas-pane')

    fireEvent.pointerDown(separator, { clientX: 500 })
    // Drag to clientX = 400 -> raw canvas width = 1000 - 400 = 600
    fireEvent.pointerMove(window, { clientX: 400 })
    expect(canvasPane.style.width).toBe('600px')

    fireEvent.pointerUp(window)
    expect(localStorage.getItem('zona_canvas_width')).toBe('600')
  })
})
