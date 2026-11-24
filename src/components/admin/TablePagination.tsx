import { ADMIN_MODEL_DEFAULT_PAGE_SIZE } from '../../lib/utils/constants'
import { NativeSelect, NativeSelectOption } from '../ui/native-select'
import {
  Pagination,
  PaginationButton,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '../ui/pagination'

export interface TablePaginationProps {
  ariaLabel: string
  page: number
  totalPages: number
  total: number
  pageSize?: number
  pageSizes?: readonly number[]
  onPageChange: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  pageSizeTestId?: string
  disabled?: boolean
}

export function TablePagination({
  ariaLabel,
  page,
  totalPages,
  total,
  pageSize = ADMIN_MODEL_DEFAULT_PAGE_SIZE,
  pageSizes,
  onPageChange,
  onPageSizeChange,
  pageSizeTestId,
  disabled = false,
}: TablePaginationProps) {
  const controlId = ariaLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  const hasRows = total > 0
  const start = hasRows ? (page - 1) * pageSize + 1 : 0
  const end = hasRows ? Math.min(page * pageSize, total) : 0
  const rangeLabel = hasRows ? `${start}–${end} dari ${total}` : '0 dari 0'

  return (
    <Pagination
      aria-label={ariaLabel}
      className="mx-0 w-full justify-between gap-3 px-4 py-2.5"
    >
      <PaginationContent className="flex flex-1 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {pageSizes && onPageSizeChange && (
            <div className="flex items-center gap-2">
              <label
                htmlFor={`${controlId}-page-size`}
                className="text-[12px] text-stone"
              >
                Baris per halaman
              </label>
              <NativeSelect
                id={`${controlId}-page-size`}
                data-testid={pageSizeTestId}
                aria-label="Baris per halaman"
                size="sm"
                className="w-16"
                value={pageSize}
                disabled={disabled}
                onChange={(event) =>
                  onPageSizeChange(Number(event.target.value))
                }
              >
                {pageSizes.map((size) => (
                  <NativeSelectOption key={size} value={size}>
                    {size}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          )}
          <span aria-live="polite" className="text-[12px] text-stone">
            {rangeLabel}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {hasRows && (
            <>
              <PaginationItem>
                <PaginationButton
                  isActive
                  aria-label={`Halaman ${page}`}
                  disabled={disabled}
                >
                  {page}
                </PaginationButton>
              </PaginationItem>
              <span className="text-[12px] text-stone">dari {totalPages}</span>
              <span className="sr-only">
                Halaman {page} dari {totalPages}
              </span>
            </>
          )}
          <PaginationItem>
            <PaginationPrevious
              disabled={disabled || page <= 1 || totalPages === 0}
              onClick={() => onPageChange(page - 1)}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              disabled={disabled || page >= totalPages || totalPages === 0}
              onClick={() => onPageChange(page + 1)}
            />
          </PaginationItem>
        </div>
      </PaginationContent>
    </Pagination>
  )
}
