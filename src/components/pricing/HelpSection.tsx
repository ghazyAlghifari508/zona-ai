import {
  ArrowRight01Icon,
  BookOpen01Icon,
  CustomerSupportIcon,
  Mail02Icon,
  MessageQuestionIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'

const HELP_CHANNELS = [
  {
    title: 'Dokumentasi',
    description: 'Pelajari cara kerja Zona.ai langkah demi langkah.',
    icon: BookOpen01Icon,
    href: '/faq',
    accent: 'bg-sky-tint text-notion-blue',
  },
  {
    title: 'Pusat Bantuan',
    description: 'Jawaban cepat untuk pertanyaan umum dan pemecahan masalah.',
    icon: MessageQuestionIcon,
    href: '/faq',
    accent: 'bg-[#fff4cf] text-marigold',
  },
  {
    title: 'Hubungi Support',
    description: 'Kirim pertanyaan langsung ke tim kami.',
    icon: Mail02Icon,
    href: 'mailto:support@zona.ai',
    accent: 'bg-[#fff0e8] text-coral',
  },
] as const

export function HelpSection() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-12 lg:px-6 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-tint text-notion-blue">
          <HugeiconsIcon
            icon={CustomerSupportIcon}
            size={24}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </span>
        <h1 className="mt-4 text-[clamp(28px,4.5vw,44px)] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
          Ada yang bisa kami bantu?
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-graphite">
          Temukan jawaban atau hubungi tim kami. Kami siap membantu kamu
          memaksimalkan Zona.ai.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-[760px] gap-4 sm:grid-cols-3">
        {HELP_CHANNELS.map((channel) => {
          const isMail = channel.href.startsWith('mailto:')
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
          return isMail ? (
            <a key={channel.title} href={channel.href} className={className}>
              {content}
            </a>
          ) : (
            <Link
              key={channel.title}
              to={channel.href as '/' | '/faq'}
              className={className}
            >
              {content}
            </Link>
          )
        })}
      </div>

      <div className="mx-auto mt-10 max-w-[760px] rounded-2xl border border-hairline bg-paper px-6 py-6 text-center">
        <p className="text-[14px] text-graphite">
          Jawaban belum kamu temukan? Coba cek{' '}
          <Link
            to="/faq"
            className="font-medium text-notion-blue hover:underline"
          >
            halaman FAQ
          </Link>{' '}
          untuk lebih banyak informasi.
        </p>
      </div>
    </div>
  )
}
