import { useState } from 'react'
import { cn } from '@/lib/utils'

export type UserAvatarProps = {
  user?: {
    name?: string | null
    image?: string | null
    email?: string | null
  } | null
  className?: string
  fallbackClassName?: string
}

export function UserAvatar({
  user,
  className,
  fallbackClassName,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false)

  const imageUrl = user?.image?.trim() || null

  const initials =
    user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'ZA'

  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-sky-tint font-bold text-notion-blue select-none',
        className,
      )}
    >
      {imageUrl && !imageError ? (
        <img
          src={imageUrl}
          alt={user?.name ?? 'Avatar'}
          referrerPolicy="no-referrer"
          crossOrigin="anonymous"
          className="h-full w-full object-cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <span
          data-testid="avatar-initials"
          className={cn('leading-none', fallbackClassName)}
        >
          {initials}
        </span>
      )}
    </span>
  )
}
