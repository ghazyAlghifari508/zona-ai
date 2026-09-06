import {
  BoltIcon,
  Clock01Icon,
  CpuIcon,
  GitCompareIcon,
  Loading03Icon,
  RocketIcon,
  Search01Icon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRouter } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import { loadSnapJs } from '@/lib/midtrans/snap-client'
import {
  type BillingPeriod,
  formatPrice,
  isPurchasablePlan,
  type PricingPlan,
  type PurchasablePlanId,
  pricingPlans,
} from '@/lib/pricing/plans'
import { cn } from '@/lib/utils'
import {
  PAYMENT_POLL_INTERVAL_MS,
  PAYMENT_POLL_MAX_ATTEMPTS,
} from '@/lib/utils/constants'
import {
  createPaymentFn,
  getPaymentStatusFn,
} from '@/server/functions/payments'

const FEATURE_ICONS = {
  credits: BoltIcon,
  models: CpuIcon,
  compare: GitCompareIcon,
  search: Search01Icon,
  speed: Clock01Icon,
  support: RocketIcon,
} as const

type PurchaseState =
  | 'idle'
  | 'creating'
  | 'awaiting'
  | 'paid'
  | 'pending'
  | 'failed'

interface PurchaseInfo {
  planId: PurchasablePlanId
  orderId: string | null
  state: PurchaseState
}

function PlanCard({
  plan,
  yearly,
  isCurrent,
  purchaseState,
  onPurchase,
  onCheckStatus,
}: {
  plan: PricingPlan
  yearly: boolean
  isCurrent: boolean
  purchaseState: PurchaseState
  onPurchase: (billingPeriod: BillingPeriod) => void
  onCheckStatus: () => void
}) {
  const isDark = plan.id === 'ultra'
  const price = yearly ? plan.priceYearly : plan.priceMonthly
  const period = yearly ? '/tahun' : '/bulan'
  const muted = isDark ? 'text-pure-white/60' : 'text-graphite'
  const heading = isDark ? 'text-pure-white' : 'text-ink'
  const isFree = plan.id === 'free'
  const isBusy = purchaseState === 'creating' || purchaseState === 'awaiting'
  const buttonLabel =
    isFree && isCurrent ? 'Paket saat ini' : `Pilih ${plan.name}`
  const buttonDisabled = isFree || isBusy
  const showTick = !isBusy && !(isFree && isCurrent)

  return (
    <div
      data-testid={`plan-card-${plan.id}`}
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

      <div className="flex items-center gap-2">
        <h3 className="text-[20px] font-semibold tracking-[-0.011em] text-ink">
          {plan.name}
        </h3>
        {isCurrent && (
          <span className="rounded-full border border-hairline bg-paper px-2 py-0.5 text-[11px] font-medium text-graphite">
            Paket saat ini
          </span>
        )}
      </div>
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
        data-testid={`plan-button-${plan.id}`}
        disabled={buttonDisabled}
        onClick={() => onPurchase(yearly ? 'yearly' : 'monthly')}
        className={cn(
          'mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg text-[14px] font-medium transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-60',
          plan.highlight.button,
        )}
      >
        {isBusy && (
          <HugeiconsIcon
            icon={Loading03Icon}
            size={16}
            strokeWidth={2}
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        )}
        {buttonLabel}
        {showTick && (
          <HugeiconsIcon
            icon={Tick01Icon}
            size={16}
            strokeWidth={2}
            aria-hidden="true"
          />
        )}
      </button>

      {purchaseState === 'paid' && (
        <div
          data-testid="payment-status-paid"
          className="mt-3 border-t border-hairline pt-3 text-[12px] text-graphite"
        >
          Kredit ditambahkan.
        </div>
      )}
      {purchaseState === 'pending' && (
        <div
          data-testid="payment-status-pending"
          className="mt-3 border-t border-hairline pt-3 text-[12px] text-graphite"
        >
          <span>Menunggu pembayaran.</span>{' '}
          <button
            type="button"
            onClick={onCheckStatus}
            className="font-medium text-notion-blue underline underline-offset-2"
          >
            Cek status
          </button>
        </div>
      )}
      {purchaseState === 'failed' && (
        <div
          data-testid="payment-status-failed"
          className="mt-3 border-t border-hairline pt-3 text-[12px] text-graphite"
        >
          <span>Pembayaran gagal.</span>{' '}
          <button
            type="button"
            onClick={() => onPurchase(yearly ? 'yearly' : 'monthly')}
            className="font-medium text-notion-blue underline underline-offset-2"
          >
            Coba lagi
          </button>
        </div>
      )}
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
          !yearly ? 'bg-ink text-pure-white' : 'text-ink/60 hover:text-ink',
        )}
      >
        Bulanan
      </button>
      <button
        type="button"
        onClick={() => setYearly(true)}
        className={cn(
          'flex h-9 items-center gap-2 rounded-full px-5 text-[13px] font-medium transition-colors duration-200',
          yearly ? 'bg-ink text-pure-white' : 'text-ink/60 hover:text-ink',
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

export function PricingSection({
  activePlanId,
  isAuthenticated,
}: {
  activePlanId: 'free' | PurchasablePlanId
  isAuthenticated: boolean
}) {
  const router = useRouter()
  const [yearly, setYearly] = useState(false)
  const [purchase, setPurchase] = useState<PurchaseInfo | null>(null)
  const pollingRef = useRef<string | null>(null)

  async function pollPaymentStatus(
    orderId: string,
  ): Promise<'paid' | 'pending' | 'failed'> {
    for (let attempt = 0; attempt < PAYMENT_POLL_MAX_ATTEMPTS; attempt += 1) {
      const result = await getPaymentStatusFn({ data: { orderId } })
      if (result.status === 'paid') return 'paid'
      if (
        result.status === 'failed' ||
        result.status === 'cancelled' ||
        result.status === 'expired'
      ) {
        return 'failed'
      }
      await new Promise<void>((resolve) => {
        setTimeout(() => resolve(), PAYMENT_POLL_INTERVAL_MS)
      })
    }
    return 'pending'
  }

  async function checkStatus(planId: PurchasablePlanId, orderId: string) {
    if (pollingRef.current === orderId) return
    pollingRef.current = orderId
    try {
      const outcome = await pollPaymentStatus(orderId)
      if (outcome === 'paid') {
        setPurchase({ planId, orderId, state: 'paid' })
        void router.invalidate()
      } else {
        setPurchase({ planId, orderId, state: outcome })
      }
    } finally {
      if (pollingRef.current === orderId) pollingRef.current = null
    }
  }

  async function handlePurchase(
    planId: PurchasablePlanId,
    billingPeriod: BillingPeriod,
  ) {
    if (!isAuthenticated) {
      void router.navigate({ to: '/auth/sign-in' })
      return
    }
    setPurchase({ planId, orderId: null, state: 'creating' })
    let orderId: string | null = null
    try {
      const created = await createPaymentFn({ data: { planId, billingPeriod } })
      orderId = created.orderId
      setPurchase({ planId, orderId, state: 'awaiting' })
      const snap = await loadSnapJs(created.clientKey, created.isProduction)
      snap.pay(created.snapToken, {
        onSuccess: () => void checkStatus(planId, created.orderId),
        onPending: () => void checkStatus(planId, created.orderId),
        onError: () => void checkStatus(planId, created.orderId),
        onClose: () => void checkStatus(planId, created.orderId),
      })
    } catch {
      setPurchase({ planId, orderId, state: 'failed' })
    }
  }

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <PricingSwitch yearly={yearly} setYearly={setYearly} />
      </div>

      <div className="grid gap-5 md:grid-cols-3">
        {pricingPlans.map((plan) => {
          const isCurrent = plan.id === activePlanId
          const isActivePurchase = purchase?.planId === plan.id
          const purchaseState: PurchaseState =
            isActivePurchase && purchase ? purchase.state : 'idle'
          const purchaseOrderId =
            isActivePurchase && purchase ? purchase.orderId : null
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              yearly={yearly}
              isCurrent={isCurrent}
              purchaseState={purchaseState}
              onPurchase={(billingPeriod) => {
                if (isPurchasablePlan(plan.id)) {
                  void handlePurchase(plan.id, billingPeriod)
                }
              }}
              onCheckStatus={() => {
                if (purchaseOrderId !== null && isPurchasablePlan(plan.id)) {
                  void checkStatus(plan.id, purchaseOrderId)
                }
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
