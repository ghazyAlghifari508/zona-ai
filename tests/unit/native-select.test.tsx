import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { type ChangeEvent, createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  NativeSelect,
  NativeSelectOption,
} from '../../src/components/ui/native-select'

afterEach(cleanup)

describe('NativeSelect', () => {
  it('keeps native combobox semantics with one decorative chevron', () => {
    const { container } = render(
      <>
        <label htmlFor="provider">Provider</label>
        <NativeSelect id="provider" value="all" onChange={() => {}}>
          <NativeSelectOption value="all">Semua provider</NativeSelectOption>
          <NativeSelectOption value="openai">OpenAI</NativeSelectOption>
        </NativeSelect>
      </>,
    )

    const select = screen.getByRole('combobox', { name: 'Provider' })
    select.focus()
    expect(document.activeElement).toBe(select)
    expect((select as HTMLSelectElement).value).toBe('all')
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['Semua provider', 'OpenAI'])
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
    expect(container.querySelectorAll('[tabindex]')).toHaveLength(0)
  })

  it('forwards controlled value changes without changing the payload', () => {
    let observedValue: string | undefined
    const onChange = vi.fn((event: ChangeEvent<HTMLSelectElement>) => {
      observedValue = event.target.value
    })
    const { rerender } = render(
      <NativeSelect aria-label="Aksi" value="add" onChange={onChange}>
        <NativeSelectOption value="add">Tambah Saldo (+)</NativeSelectOption>
        <NativeSelectOption value="deduct">
          Kurangi Saldo (-)
        </NativeSelectOption>
      </NativeSelect>,
    )

    const select = screen.getByRole('combobox', { name: 'Aksi' })
    fireEvent.change(select, { target: { value: 'deduct' } })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(observedValue).toBe('deduct')

    rerender(
      <NativeSelect aria-label="Aksi" value="deduct" onChange={onChange}>
        <NativeSelectOption value="add">Tambah Saldo (+)</NativeSelectOption>
        <NativeSelectOption value="deduct">
          Kurangi Saldo (-)
        </NativeSelectOption>
      </NativeSelect>,
    )
    expect((select as HTMLSelectElement).value).toBe('deduct')
  })

  it('preserves disabled state, refs and the compact variant', () => {
    const ref = createRef<HTMLSelectElement>()
    const { container } = render(
      <NativeSelect
        ref={ref}
        aria-label="Versi"
        size="sm"
        disabled
        value="v1"
        onChange={() => {}}
      >
        <NativeSelectOption value="v1">v1</NativeSelectOption>
      </NativeSelect>,
    )

    const select = screen.getByRole('combobox', { name: 'Versi' })
    expect((select as HTMLSelectElement).disabled).toBe(true)
    expect(ref.current).toBe(select)
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1)
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
})
