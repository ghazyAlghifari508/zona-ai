type Props = {
  size?: number
  className?: string
  alt?: string
  'data-testid'?: string
}

export function BrandLogo({
  size = 32,
  className = '',
  alt = 'Zona.ai',
  'data-testid': testId,
}: Props) {
  return (
    <span
      data-testid={testId}
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src="/assets/zonaai-logo.png"
        alt={alt}
        width={size}
        height={size}
        className="h-full w-full shrink-0 object-contain dark:hidden"
      />
      <img
        src="/assets/zonaai-logo-white.png"
        alt={alt}
        width={size}
        height={size}
        className="hidden h-full w-full shrink-0 object-contain dark:block"
      />
    </span>
  )
}
