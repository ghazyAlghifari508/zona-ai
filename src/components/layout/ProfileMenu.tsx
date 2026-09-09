import {
  BubbleChatQuestionIcon,
  HelpCircleIcon,
  Logout01Icon,
  Moon02Icon,
  Settings01Icon,
  Shield01Icon,
  Sun03Icon,
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
import { UserAvatar } from '@/components/ui/UserAvatar'
import { authClient } from '@/lib/auth/auth-client'
import { useTheme } from '@/lib/ui/theme'

type Props = {
  user:
    | {
        name?: string | null
        email?: string | null
        image?: string | null
        role?: string | null
      }
    | null
    | undefined
}

export function ProfileMenu({ user }: Props) {
  const [theme, toggleTheme] = useTheme()
  const isDark = theme === 'dark'
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
        <DropdownMenuItem asChild className="sm:hidden">
          <Link
            to="/faq"
            data-testid="profile-faq"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink cursor-pointer transition-colors duration-200 hover:bg-ink/5 focus:bg-ink/5"
          >
            <HugeiconsIcon
              icon={BubbleChatQuestionIcon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            FAQ
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="sm:hidden">
          <Link
            to="/bantuan"
            data-testid="profile-bantuan"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink cursor-pointer transition-colors duration-200 hover:bg-ink/5 focus:bg-ink/5"
          >
            <HugeiconsIcon
              icon={HelpCircleIcon}
              size={16}
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Bantuan
          </Link>
        </DropdownMenuItem>
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
        {user?.role === 'admin' && (
          <DropdownMenuItem asChild>
            <Link
              to="/admin"
              data-testid="profile-admin"
              className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink cursor-pointer transition-colors duration-200 hover:bg-ink/5 focus:bg-ink/5"
            >
              <HugeiconsIcon
                icon={Shield01Icon}
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              Admin
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          data-testid="profile-theme-toggle"
          onSelect={(event) => {
            event.preventDefault()
          }}
          onClick={() => {
            toggleTheme()
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] text-ink cursor-pointer transition-colors duration-200 hover:bg-ink/5 focus:bg-ink/5"
        >
          <HugeiconsIcon
            icon={isDark ? Sun03Icon : Moon02Icon}
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Tampilan
          <span
            data-testid="profile-theme-state"
            className="ml-auto text-[11px] text-stone"
          >
            {isDark ? 'Gelap' : 'Terang'}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          asChild
          className="text-coral focus:bg-danger-soft focus:text-coral"
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
