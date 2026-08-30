import {
  BoltIcon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  CpuIcon,
  GitCompareIcon,
  RocketIcon,
  Search01Icon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import {
  formatPrice,
  getPlanById,
  type PricingPlan,
  pricingPlans,
} from '@/lib/pricing/plans'
import { cn } from '@/lib/utils'

const FEATURE_ICONS = {
  credits: BoltIcon,
  models: CpuIcon,
  compare: GitCompareIcon,
  search: Search01Icon,
  speed: Clock01Icon,
  support: RocketIcon,
} as const

function PlanCard({ plan, yearly }: { plan: PricingPlan; yearly: boolean }) {
  const isDark = plan.id === 'ultra'
  const price = yearly ? plan.priceYearly : plan.priceMonthly
  const period = yearly ? '/tahun' : '/bulan'
  const muted = isDark ? 'text-pure-white/60' : 'text-graphite'
  const heading = isDark ? 'text-pure-white' : 'text-ink'

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-xl border p-6',
        isDark ? 'border-transparent' : 'border-hairline',
        plan.highlight.card,
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-notion-blue px-3 py-1 text-[11px] font-semibold text-pure-white">
          Populer
        </span>
      )}

      <h3 className="text-[20px] font-semibold tracking-[-0.011em] text-ink">
        {plan.name}
      </h3>
      <p className={cn('mt-1 text-[13px] leading-relaxed', muted)}>
        {plan.tagline}
      </p>
      <p className={cn('mt-1 text-[12px]', muted)}>
        {plan.credits.toLocaleString('id-ID')} kredit / bulan
      </p>

      <div className="mt-5 flex items-baseline gap-1">
        <span
          className={cn(
            'text-[40px] leading-none font-semibold tracking-[-0.036em]',
            heading,
          )}
        >
          {price === 0 ? 'Rp0' : formatPrice(price)}
        </span>
        <span className={cn('text-[13px]', muted)}>{period}</span>
      </div>

      <div
        className={cn('my-6 h-px', isDark ? 'bg-pure-white/15' : 'bg-hairline')}
      />

      <div className="flex flex-1 flex-col gap-3">
        {plan.features.map((feature) => {
          const FeatureIcon = FEATURE_ICONS[feature.icon]
          return (
            <div key={feature.text} className="flex items-center gap-3">
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                  feature.included
                    ? plan.highlight.icon
                    : isDark
                      ? 'bg-pure-white/10 text-pure-white/40'
                      : 'bg-ink/5 text-ink/30',
                )}
              >
                <HugeiconsIcon
                  icon={FeatureIcon}
                  size={16}
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
              </span>
              <span
                className={cn(
                  'text-[13px] leading-snug',
                  feature.included
                    ? isDark
                      ? 'text-pure-white/90'
                      : 'text-ink'
                    : muted,
                )}
              >
                {feature.text}
              </span>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        className={cn(
          'mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium transition-colors duration-200',
          plan.highlight.button,
        )}
      >
        {plan.current ? 'Paket saat ini' : `Pilih ${plan.name}`}
        {!plan.current && (
          <HugeiconsIcon
            icon={Tick01Icon}
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  )
}

function PricingSwitch({
  yearly,
  setYearly,
}: {
  yearly: boolean
  setYearly: (v: boolean) => void
}) {
  return (
    <div className="inline-flex w-fit items-center rounded-full border border-hairline bg-pure-white p-1">
      <button
        type="button"
        onClick={() => setYearly(false)}
        className={cn(
          'h-9 rounded-full px-5 text-[13px] font-medium transition-colors duration-200',
          !yearly ? 'bg-paper text-ink' : 'text-ink/60 hover:text-ink',
        )}
      >
        Bulanan
      </button>
      <button
        type="button"
        onClick={() => setYearly(true)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-full px-5 text-[13px] font-medium transition-colors duration-200',
          yearly ? 'bg-paper text-ink' : 'text-ink/60 hover:text-ink',
        )}
      >
        Tahunan
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[11px] font-medium',
            yearly ? 'bg-sky-tint text-notion-blue' : 'bg-ink/5 text-ink/60',
          )}
        >
          Hemat 20%
        </span>
      </button>
    </div>
  )
}

export function PricingSection() {
  const [yearly, setYearly] = useState(false)
  const currentPlan = getPlanById('free')

  return (
    <div className="min-h-screen bg-paper pb-16">
      <div className="mx-auto w-full max-w-[1200px] px-4 lg:px-6">
        <div className="mx-auto max-w-2xl pt-20 text-center">
          <h1 className="text-[clamp(32px,4.5vw,48px)] font-semibold leading-[1.04] tracking-[-0.035em] text-ink">
            Pilih paket yang paling{' '}
            <span className="inline-block rounded-xl border border-dashed border-notion-blue bg-sky-tint px-2 py-0.5 capitalize">
              tepat
            </span>{' '}
            untukmu
          </h1>
          <p className="mx-auto mt-4 max-w-md text-[15px] leading-[1.5] text-graphite">
            Mulai gratis, lalu naikkan kapasitas kredit dan fitur saat kamu
            butuh lebih banyak.
          </p>
        </div>

        <div className="mt-8 flex justify-center">
          <PricingSwitch yearly={yearly} setYearly={setYearly} />
        </div>

        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {pricingPlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} yearly={yearly} />
          ))}
        </div>

        <div className="mx-auto mt-12 flex max-w-xl flex-col items-center gap-2 rounded-xl border border-hairline bg-pure-white px-6 py-5 text-center">
          <span className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={16}
              strokeWidth={1.75}
              className="text-notion-blue"
              aria-hidden="true"
            />
            Paket saat ini: {currentPlan.name}
          </span>
          <p className="text-[13px] leading-relaxed text-graphite">
            Kamu memakai paket{' '}
            <span className="font-medium text-ink">{currentPlan.name}</span>{' '}
            dengan {currentPlan.credits.toLocaleString('id-ID')} kredit.
            Pembayaran otomatis belum aktif.
          </p>
          <Link
            to="/"
            data-testid="pricing-back-to-chat"
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium text-notion-blue hover:bg-sky-tint/50"
          >
            <HugeiconsIcon
              icon={Tick01Icon}
              size={14}
              strokeWidth={2}
              aria-hidden="true"
            />
            Kembali ke chat
          </Link>
        </div>
      </div>
    </div>
  )
}
