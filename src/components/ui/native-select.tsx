import { ChevronDownIcon } from 'lucide-react'
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface NativeSelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'default' | 'sm'
}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, size = 'default', ...props }, ref) => (
    <div className="relative flex max-w-full min-w-0 has-[select:disabled]:opacity-50">
      <select
        ref={ref}
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-md border border-hairline bg-paper pr-9 pl-3 text-[13px] text-ink transition-colors focus:border-hairline-strong disabled:pointer-events-none disabled:cursor-not-allowed',
          size === 'sm' && 'h-7 rounded pr-7 pl-2 text-[12px]',
          className,
        )}
        {...props}
      />
      <ChevronDownIcon
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-stone',
          size === 'sm' && 'right-2 size-3.5',
        )}
      />
    </div>
  ),
)
NativeSelect.displayName = 'NativeSelect'

function NativeSelectOption({
  className,
  ...props
}: React.ComponentProps<'option'>) {
  return <option className={cn('bg-paper text-ink', className)} {...props} />
}

export { NativeSelect, NativeSelectOption }
