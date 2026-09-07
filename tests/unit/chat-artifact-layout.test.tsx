import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConversationArtifactLayout } from '../../src/components/artifacts/ConversationArtifactLayout'

function DraftInput({ label }: { label: string }) {
  const [value, setValue] = useState('')
  return (
    <input
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  )
}

function Harness({ startOpen = false }: { startOpen?: boolean }) {
  const [canvasOpen, setCanvasOpen] = useState(startOpen)
  return (
    <>
      <button type="button" onClick={() => setCanvasOpen(true)}>
        Open artifact
      </button>
      <ConversationArtifactLayout
        canvasOpen={canvasOpen}
        chatPane={<DraftInput label="Chat draft" />}
        canvasPane={
          <div>
            <DraftInput label="Canvas draft" />
            <button type="button" onClick={() => setCanvasOpen(false)}>
              Back to chat
            </button>
          </div>
        }
      />
    </>
  )
}

describe('ConversationArtifactLayout state preservation', () => {
  afterEach(cleanup)

  it('preserves the chat draft when the Canvas Back callback returns to chat', () => {
    render(<Harness />)
    const draft = screen.getByRole('textbox', { name: 'Chat draft' })
    fireEvent.change(draft, { target: { value: 'unsent draft' } })

    fireEvent.click(screen.getByRole('button', { name: 'Open artifact' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }))

    expect(
      (screen.getByRole('textbox', { name: 'Chat draft' }) as HTMLInputElement)
        .value,
    ).toBe('unsent draft')
  })

  it('preserves Canvas child state after Back and reopening', () => {
    render(<Harness startOpen />)
    const canvasDraft = screen.getByRole('textbox', { name: 'Canvas draft' })
    fireEvent.change(canvasDraft, { target: { value: 'review note' } })

    fireEvent.click(screen.getByRole('button', { name: 'Back to chat' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open artifact' }))

    expect(
      (
        screen.getByRole('textbox', {
          name: 'Canvas draft',
        }) as HTMLInputElement
      ).value,
    ).toBe('review note')
  })
})
