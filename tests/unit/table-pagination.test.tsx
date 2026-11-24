import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TablePagination } from '../../src/components/admin/TablePagination'

afterEach(cleanup)

describe('TablePagination', () => {
  it('calls page callbacks and disables navigation at bounds', () => {
    const onPageChange = vi.fn()
    render(
      <TablePagination
        ariaLabel="Navigasi halaman model"
        page={2}
        totalPages={3}
        total={53}
        pageSize={20}
        onPageChange={onPageChange}
      />,
    )

    expect(screen.getByText('21–40 dari 53')).toBeDefined()
    expect(screen.getByText('Halaman 2 dari 3')).toBeDefined()
    expect(screen.getByText('2').getAttribute('aria-current')).toBe('page')

    const previous = screen.getByRole('button', { name: 'Sebelumnya' })
    const next = screen.getByRole('button', { name: 'Berikutnya' })
    expect(previous.hasAttribute('disabled')).toBe(false)
    expect(next.hasAttribute('disabled')).toBe(false)

    fireEvent.click(previous)
    fireEvent.click(next)
    expect(onPageChange.mock.calls).toEqual([[1], [3]])
  })

  it('disables both directions for empty or single page and while loading', () => {
    const { rerender } = render(
      <TablePagination
        ariaLabel="Navigasi kosong"
        page={1}
        totalPages={0}
        total={0}
        pageSize={10}
        onPageChange={vi.fn()}
      />,
    )

    expect(screen.getByText('0 dari 0')).toBeDefined()
    expect(screen.queryByText('Halaman 1 dari 0')).toBeNull()
    expect(
      (screen.getByRole('button', { name: 'Sebelumnya' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'Berikutnya' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)

    rerender(
      <TablePagination
        ariaLabel="Navigasi loading"
        page={1}
        totalPages={4}
        total={40}
        pageSize={10}
        disabled
        onPageChange={vi.fn()}
      />,
    )
    expect(
      (screen.getByRole('button', { name: 'Berikutnya' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })

  it('reports page size changes through the native select', () => {
    const onPageSizeChange = vi.fn()
    render(
      <TablePagination
        ariaLabel="Navigasi halaman model"
        page={1}
        totalPages={6}
        total={53}
        pageSize={10}
        pageSizes={[10, 20, 50]}
        onPageChange={vi.fn()}
        onPageSizeChange={onPageSizeChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Baris per halaman'), {
      target: { value: '50' },
    })
    expect(onPageSizeChange).toHaveBeenCalledWith(50)
  })
})
