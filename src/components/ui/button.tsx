import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink-black disabled:pointer-events-none disabled:opacity-50 border',
  {
    variants: {
      variant: {
        default:
          'bg-ink-black text-pure-white border-transparent hover:bg-ink-black/90',
        destructive:
          'bg-coral-pop text-pure-white border-transparent hover:bg-coral-pop/90',
        outline:
          'bg-pure-white text-ink-black border-hairline-mist hover:bg-sandstone',
        secondary:
          'bg-sandstone text-ink-black border-transparent hover:bg-sandstone/80',
        ghost:
          'bg-transparent text-ink-black border-transparent hover:bg-sandstone',
        link: 'text-ink-black underline-offset-4 hover:underline bg-transparent border-transparent',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-full px-3 text-xs',
        lg: 'h-11 rounded-full px-8',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
