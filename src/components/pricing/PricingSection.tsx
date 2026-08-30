import {
  CheckmarkCircle02Icon,
  RocketIcon,
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

function PlanCard({ plan, yearly }: { plan: PricingPlan; yearly: boolean }) {
  const price = yearly ? plan.priceYearly : plan.priceMonthly
  const period = yearly ? '/tahun' : '/bulan'
  return (
    <div
      className={cn(
        'relative flex flex-col rounded-2xl border border-hairline p-6',
        plan.highlight.card,
      )}
    >
      {plan.popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-notion-blue px-3 py-1 text-[11px] font-semibold text-pure-white">
          Populer
        </span>
      )}
      <h3
        className={cn(
          'text-[20px] font-bold tracking-[-0.02em]',
          plan.id === 'ultra' ? 'text-pure-white' : 'text-ink',
        )}
      >
        {plan.name}
      </h3>
      <p
        className={cn(
          'mt-1 text-[13px] leading-relaxed',
          plan.id === 'ultra' ? 'text-pure-white/70' : 'text-graphite',
        )}
      >
        {plan.tagline}
      </p>

      <div
        className={cn(
          'mt-5 flex items-baseline gap-1',
          plan.id === 'ultra' ? 'text-pure-white' : 'text-ink',
        )}
      >
        <span className="text-[34px] font-bold tracking-[-0.03em]">
          {price === 0 ? 'Rp0' : formatPrice(price)}
        </span>
        <span
          className={cn(
            'text-[13px]',
            plan.id === 'ultra' ? 'text-pure-white/70' : 'text-stone',
          )}
        >
          {period}
        </span>
      </div>

      <div
        className={cn(
          'mt-4 rounded-lg px-3 py-2.5 text-[12px] font-medium',
          plan.id === 'ultra'
            ? 'bg-pure-white/10 text-pure-white'
            : 'bg-ink/5 text-graphite',
        )}
      >
        {plan.credits.toLocaleString('id-ID')} kredit per bulan
      </div>

      <div className="mt-5 flex flex-1 flex-col gap-2.5">
        {plan.features.map((feature) => (
          <div key={feature.text} className="flex items-start gap-2.5">
            <span
              className={cn(
                'mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full',
                feature.included
                  ? plan.id === 'ultra'
                    ? 'bg-pure-white/20 text-pure-white'
                    : 'bg-sky-tint text-notion-blue'
                  : plan.id === 'ultra'
                    ? 'bg-pure-white/10 text-pure-white/40'
                    : 'bg-ink/5 text-ink/30',
              )}
            >
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={12}
                strokeWidth={2}
                aria-hidden="true"
              />
            </span>
            <span
              className={cn(
                'text-[13px] leading-snug',
                feature.included
                  ? plan.id === 'ultra'
                    ? 'text-pure-white/90'
                    : 'text-ink'
                  : plan.id === 'ultra'
                    ? 'text-pure-white/40'
                    : 'text-stone',
              )}
            >
              {feature.text}
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className={cn(
          'mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-semibold transition-colors duration-200',
          plan.highlight.button,
        )}
      >
        {plan.current ? 'Paket saat ini' : `Pilih ${plan.name}`}
      </button>
    </div>
  )
}

export function PricingSection() {
  const [yearly, setYearly] = useState(false)
  const currentPlan = getPlanById('free')

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-12 lg:px-6 lg:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-[clamp(28px,4.5vw,44px)] font-bold leading-[1.1] tracking-[-0.03em] text-ink">
          Pilih paket yang paling{' '}
          <span className="rounded-xl border border-dashed border-notion-blue bg-sky-tint px-2 py-0.5 text-notion-blue">
            tepat
          </span>{' '}
          untukmu
        </h1>
        <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-graphite">
          Mulai gratis, lalu naikkan kapasitas kredit dan fitur saat kamu butuh
          lebih banyak.
        </p>
      </div>

      <div className="mt-6 flex justify-center">
        <div className="relative z-10 flex w-fit items-center rounded-full border border-hairline bg-pure-white p-1">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn(
              'relative rounded-full px-5 py-2 text-[13px] font-medium transition-colors duration-200',
              !yearly
                ? 'bg-notion-blue text-pure-white'
                : 'text-ink/60 hover:text-ink',
            )}
          >
            Bulanan
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={cn(
              'relative flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-medium transition-colors duration-200',
              yearly
                ? 'bg-notion-blue text-pure-white'
                : 'text-ink/60 hover:text-ink',
            )}
          >
            Tahunan
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                yearly
                  ? 'bg-pure-white/20 text-pure-white'
                  : 'bg-sky-tint text-ink',
              )}
            >
              Hemat 20%
            </span>
          </button>
        </div>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {pricingPlans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} yearly={yearly} />
        ))}
      </div>

      <div className="mx-auto mt-10 flex max-w-xl flex-col items-center gap-2 rounded-xl border border-hairline bg-paper px-6 py-5 text-center">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-ink">
          <HugeiconsIcon
            icon={RocketIcon}
            size={16}
            strokeWidth={1.75}
            className="text-notion-blue"
            aria-hidden="true"
          />
          Paket saat ini: {currentPlan.name}
        </span>
        <p className="text-[13px] text-graphite">
          Kamu memakai paket{' '}
          <span className="font-semibold">{currentPlan.name}</span> dengan{' '}
          {currentPlan.credits.toLocaleString('id-ID')} kredit. Pembayaran
          otomatis belum aktif.
        </p>
        {currentPlan.current && (
          <Link
            to="/"
            data-testid="pricing-back-to-chat"
            className="mt-1 inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-notion-blue hover:bg-sky-tint/50"
          >
            <HugeiconsIcon
              icon={Tick01Icon}
              size={14}
              strokeWidth={2}
              aria-hidden="true"
            />
            Kembali ke chat
          </Link>
        )}
      </div>
    </div>
  )
}
