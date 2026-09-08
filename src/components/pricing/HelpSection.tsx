import {
  ArrowRight01Icon,
  BookOpen01Icon,
  Mail02Icon,
  Message01Icon,
  MessageQuestionIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'

type InternalHelpChannel = {
  title: string
  description: string
  icon: typeof BookOpen01Icon
  to: '/faq' | '/feedback'
  accent: string
}

type ExternalHelpChannel = {
  title: string
  description: string
  icon: typeof BookOpen01Icon
  href: string
  accent: string
}

type HelpChannel = InternalHelpChannel | ExternalHelpChannel

const HELP_CHANNELS: readonly HelpChannel[] = [
  {
    title: 'Dokumentasi',
    description: 'Pelajari cara kerja Zona.ai langkah demi langkah.',
    icon: BookOpen01Icon,
    to: '/faq',
    accent: 'bg-sky-tint text-notion-blue',
  },
  {
    title: 'Pusat Bantuan',
    description: 'Jawaban cepat untuk pertanyaan umum dan pemecahan masalah.',
    icon: MessageQuestionIcon,
    to: '/faq',
    accent: 'bg-warning-soft text-warning-strong',
  },
  {
    title: 'Hubungi Support',
    description: 'Kirim pertanyaan langsung ke tim kami.',
    icon: Mail02Icon,
    href: 'mailto:support@zona.ai',
    accent: 'bg-danger-soft text-coral',
  },
  {
    title: 'Kirim Feedback',
    description:
      'Beri saran fitur atau laporkan kendala teknis secara langsung.',
    icon: Message01Icon,
    to: '/feedback',
    accent: 'bg-info-soft text-notion-blue',
  },
]

export function HelpSection() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {HELP_CHANNELS.map((channel) => {
        const content = (
          <>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${channel.accent}`}
            >
              <HugeiconsIcon
                icon={channel.icon}
                size={20}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="mt-4 block text-[15px] font-semibold text-ink">
              {channel.title}
            </span>
            <span className="mt-1 block text-[13px] leading-relaxed text-graphite">
              {channel.description}
            </span>
            <span className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-notion-blue">
              Buka
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                size={14}
                strokeWidth={2}
                aria-hidden="true"
              />
            </span>
          </>
        )
        const className =
          'flex flex-col rounded-2xl border border-hairline bg-pure-white p-6 transition-all duration-200 hover:border-hairline-strong hover:-translate-y-0.5'

        if ('href' in channel) {
          return (
            <a key={channel.title} href={channel.href} className={className}>
              {content}
            </a>
          )
        }

        return (
          <Link key={channel.title} to={channel.to} className={className}>
            {content}
          </Link>
        )
      })}
    </div>
  )
}
