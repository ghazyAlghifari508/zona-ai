import {
  Logout01Icon,
  Settings01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { authClient } from '@/lib/auth/auth-client'

type Props = {
  user:
    | {
        name?: string | null
        email?: string | null
        image?: string | null
      }
    | null
    | undefined
}

export function ProfileMenu({ user }: Props) {
  const initials =
    user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'ZA'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="profile-menu-trigger"
          aria-label="Profil"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-tint text-[12px] font-semibold text-notion-blue transition-colors duration-200 hover:bg-sky-tint/70 overflow-hidden border border-hairline"
        >
          {user?.image ? (
            <img
              src={user.image}
              alt={user.name ?? 'Avatar'}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
          ) : (
            initials
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[220px]">
        <DropdownMenuLabel className="flex items-center gap-2.5 px-2.5 py-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sky-tint text-[11px] font-semibold text-notion-blue overflow-hidden border border-hairline">
            {user?.image ? (
              <img
                src={user.image}
                alt={user.name ?? 'Avatar'}
                className="h-full w-full object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <HugeiconsIcon
                icon={UserIcon}
                size={15}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[13px] font-medium text-ink">
              {user?.name ?? 'Pengguna'}
            </span>
            <span className="truncate text-[11px] text-stone">
              {user?.email ?? ''}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/settings"
            data-testid="profile-settings"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink cursor-pointer transition-colors duration-200 hover:bg-ink/5 focus:bg-ink/5"
          >
            <HugeiconsIcon
              icon={Settings01Icon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Pengaturan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          asChild
          className="text-coral focus:bg-rose-50 focus:text-coral"
        >
          <button
            type="button"
            data-testid="profile-sign-out"
            onClick={() => {
              void authClient.signOut({
                fetchOptions: {
                  onSuccess: () => window.location.assign('/auth/sign-in'),
                },
              })
            }}
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px]"
          >
            <HugeiconsIcon
              icon={Logout01Icon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Keluar
          </button>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
