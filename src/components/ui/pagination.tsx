import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MoreHorizontalIcon,
} from 'lucide-react'
import type * as React from 'react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function Pagination({ className, ...props }: React.ComponentProps<'nav'>) {
  return (
    <nav
      aria-label="pagination"
      data-slot="pagination"
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  )
}

function PaginationContent({
  className,
  ...props
}: React.ComponentProps<'ul'>) {
  return (
    <ul
      data-slot="pagination-content"
      className={cn('flex flex-row items-center gap-1', className)}
      {...props}
    />
  )
}

function PaginationItem(props: React.ComponentProps<'li'>) {
  return <li data-slot="pagination-item" {...props} />
}

type PaginationButtonProps = {
  isActive?: boolean
} & React.ComponentProps<'button'>

function PaginationButton({
  className,
  isActive,
  type = 'button',
  ...props
}: PaginationButtonProps) {
  return (
    <button
      type={type}
      aria-current={isActive ? 'page' : undefined}
      data-slot="pagination-link"
      data-active={isActive}
      className={cn(
        buttonVariants({
          variant: isActive ? 'outline' : 'ghost',
          size: 'icon',
        }),
        'h-7 w-7 text-[12px]',
        className,
      )}
      {...props}
    />
  )
}

function PaginationPrevious({
  className,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label="Sebelumnya"
      data-slot="pagination-previous"
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'gap-1 px-2 text-[12px]',
        className,
      )}
      {...props}
    >
      <ChevronLeftIcon className="size-4" aria-hidden="true" />
      <span className="hidden sm:block">Sebelumnya</span>
    </button>
  )
}

function PaginationNext({
  className,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label="Berikutnya"
      data-slot="pagination-next"
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'sm' }),
        'gap-1 px-2 text-[12px]',
        className,
      )}
      {...props}
    >
      <span className="hidden sm:block">Berikutnya</span>
      <ChevronRightIcon className="size-4" aria-hidden="true" />
    </button>
  )
}

function PaginationEllipsis({
  className,
  ...props
}: React.ComponentProps<'span'>) {
  return (
    <span
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn('flex size-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontalIcon className="size-4" />
    </span>
  )
}

export {
  Pagination,
  PaginationButton,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
}
