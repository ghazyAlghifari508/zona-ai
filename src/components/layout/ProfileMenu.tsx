import { Logout01Icon, Settings01Icon } from '@hugeicons/core-free-icons'
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
import { UserAvatar } from '@/components/ui/UserAvatar'
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="profile-menu-trigger"
          aria-label="Profil"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-opacity duration-200 hover:opacity-85"
        >
          <UserAvatar user={user} className="h-9 w-9 text-[12px]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-[220px]">
        <DropdownMenuLabel className="flex items-center gap-2.5 px-2.5 py-2">
          <UserAvatar user={user} className="h-8 w-8 text-[11px]" />
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
