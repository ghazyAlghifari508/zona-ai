import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ChecklistView,
  clearCompletedOverrides,
} from '../../src/components/chat/ChecklistView'
import type { Checklist } from '../../src/lib/chat/checklist'

const simpleChecklist: Checklist = {
  type: 'checklist',
  title: 'To-do hari ini',
  items: [
    { id: 'task-1', text: 'Mandi', completed: false },
    { id: 'task-2', text: 'Makan', completed: false },
    { id: 'task-3', text: 'Sholat', completed: false },
  ],
}

describe('ChecklistView', () => {
  afterEach(() => {
    cleanup()
    clearCompletedOverrides()
  })

  it('renders tasks as interactive checkboxes', () => {
    render(<ChecklistView checklist={simpleChecklist} storageKey="msg:a" />)

    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(3)
    for (const box of checkboxes) {
      expect((box as HTMLInputElement).checked).toBe(false)
      expect((box as HTMLInputElement).disabled).toBe(false)
    }
    expect(screen.getByText('To-do hari ini')).toBeTruthy()
    expect(screen.getByText('Mandi')).toBeTruthy()
  })

  it('toggles a task on and off via click', () => {
    render(<ChecklistView checklist={simpleChecklist} storageKey="msg:b" />)

    const box = screen.getAllByRole('checkbox')[0] as HTMLInputElement
    fireEvent.click(box)
    expect(box.checked).toBe(true)
    fireEvent.click(box)
    expect(box.checked).toBe(false)
  })

  it('toggling one task keeps other tasks untouched', () => {
    render(<ChecklistView checklist={simpleChecklist} storageKey="msg:c" />)

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    fireEvent.click(boxes[1])
    expect(boxes[1].checked).toBe(true)
    expect(boxes[0].checked).toBe(false)
    expect(boxes[2].checked).toBe(false)
  })

  it('persists completed state across remount', () => {
    const first = render(
      <ChecklistView checklist={simpleChecklist} storageKey="msg:d" />,
    )
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    first.unmount()

    render(<ChecklistView checklist={simpleChecklist} storageKey="msg:d" />)
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes[1].checked).toBe(true)
  })

  it('restores persisted state from an initialCompleted snapshot', () => {
    render(
      <ChecklistView
        checklist={simpleChecklist}
        storageKey="msg:e"
        initialCompleted={{ 'task-2': true }}
      />,
    )
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes[1].checked).toBe(true)
  })

  it('marks checked task label with completed styling hook', () => {
    render(<ChecklistView checklist={simpleChecklist} storageKey="msg:f" />)
    const firstItem = screen.getByTestId('checklist-item-task-1')
    fireEvent.click(screen.getAllByRole('checkbox')[0])

    expect(firstItem.getAttribute('data-completed')).toBe('true')
  })

  it('renders long task text wrapped without breaking layout', () => {
    const longChecklist: Checklist = {
      type: 'checklist',
      items: [
        {
          id: 'task-1',
          text: 'Siapkan kebutuhan puasa besok: makanan untuk sahur, air minum, dan jadwal ibadah yang akan dijalankan sepanjang hari.',
          completed: false,
        },
      ],
    }
    render(<ChecklistView checklist={longChecklist} storageKey="msg:g" />)

    const label = screen.getByTestId('checklist-item-task-1')
    expect(label.textContent).toContain('Siapkan kebutuhan puasa besok')
    expect(screen.getByRole('checkbox')).toBeTruthy()
  })

  it('renders progress counter matching checked count', () => {
    render(<ChecklistView checklist={simpleChecklist} storageKey="msg:h" />)
    const counter = screen.getByTestId('checklist-progress')
    expect(counter.textContent).toContain('0/3')

    fireEvent.click(screen.getAllByRole('checkbox')[2])
    expect(counter.textContent).toContain('1/3')
  })

  it('keeps independent state between two different storage keys', () => {
    render(
      <div>
        <ChecklistView checklist={simpleChecklist} storageKey="gen:one" />
        <ChecklistView checklist={simpleChecklist} storageKey="gen:two" />
      </div>,
    )

    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    fireEvent.click(boxes[0])

    expect(boxes[0].checked).toBe(true)
    expect(boxes[3].checked).toBe(false)
  })
})
