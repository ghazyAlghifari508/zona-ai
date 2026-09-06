export type PlanId = 'free' | 'pro' | 'ultra'

export interface PricingPlan {
  id: PlanId
  name: string
  tagline: string
  priceMonthly: number
  priceYearly: number
  credits: number
  popular?: boolean
  highlight: {
    card: string
    button: string
    icon: string
  }
  features: Array<{
    text: string
    included: boolean
    icon: 'credits' | 'models' | 'compare' | 'search' | 'speed' | 'support'
  }>
}

export const PRICING_CURRENCY = 'IDR'

export const DEFAULT_PLAN_ID: PlanId = 'free'

export const pricingPlans: PricingPlan[] = [
  {
    id: 'free',
    name: 'Free',
    tagline: 'Mulai percakapan dan bandingkan model tanpa biaya.',
    priceMonthly: 0,
    priceYearly: 0,
    credits: 100,
    highlight: {
      card: 'bg-pure-white',
      button:
        'border border-hairline-strong bg-pure-white text-ink hover:bg-ink/5',
      icon: 'bg-sky-tint text-notion-blue',
    },
    features: [
      { text: '100 kredit per bulan', included: true, icon: 'credits' },
      { text: 'Akses semua model AI', included: true, icon: 'models' },
      { text: 'Compare Mode hingga 2 model', included: true, icon: 'compare' },
      { text: 'Pencarian web (Tavily)', included: true, icon: 'search' },
      { text: 'Prioritas kecepatan', included: false, icon: 'speed' },
      { text: 'Dukungan prioritas', included: false, icon: 'support' },
    ],
  },
  {
    id: 'pro',
    name: 'Pro',
    tagline: 'Untuk pengguna aktif yang butuh lebih banyak kredit.',
    priceMonthly: 49000,
    priceYearly: 470000,
    credits: 2000,
    popular: true,
    highlight: {
      card: 'bg-pure-white ring-2 ring-notion-blue',
      button: 'bg-accent text-white hover:bg-accent-hover',
      icon: 'bg-sky-tint text-notion-blue',
    },
    features: [
      { text: '2.000 kredit per bulan', included: true, icon: 'credits' },
      { text: 'Akses semua model AI', included: true, icon: 'models' },
      { text: 'Compare Mode hingga 4 model', included: true, icon: 'compare' },
      { text: 'Pencarian web (Tavily)', included: true, icon: 'search' },
      { text: 'Prioritas kecepatan', included: true, icon: 'speed' },
      { text: 'Dukungan prioritas', included: false, icon: 'support' },
    ],
  },
  {
    id: 'ultra',
    name: 'Ultra',
    tagline: 'Kapasitas maksimal untuk tim dan beban kerja berat.',
    priceMonthly: 149000,
    priceYearly: 1430000,
    credits: 10000,
    highlight: {
      card: 'bg-midnight text-white',
      button: 'bg-white text-[#111111] hover:bg-white/90',
      icon: 'bg-white/15 text-white',
    },
    features: [
      { text: '10.000 kredit per bulan', included: true, icon: 'credits' },
      { text: 'Akses semua model AI', included: true, icon: 'models' },
      { text: 'Compare Mode hingga 4 model', included: true, icon: 'compare' },
      { text: 'Pencarian web (Tavily)', included: true, icon: 'search' },
      { text: 'Prioritas kecepatan', included: true, icon: 'speed' },
      { text: 'Dukungan prioritas', included: true, icon: 'support' },
    ],
  },
]

export function getPlanById(id: PlanId): PricingPlan {
  return pricingPlans.find((p) => p.id === id) ?? pricingPlans[0]
}

export function formatPrice(idr: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: PRICING_CURRENCY,
    maximumFractionDigits: 0,
  }).format(idr)
}

export type PurchasablePlanId = 'pro' | 'ultra'
export type BillingPeriod = 'monthly' | 'yearly'

const PURCHASABLE_PLAN_IDS: readonly string[] = ['pro', 'ultra']
const BILLING_PERIODS: readonly string[] = ['monthly', 'yearly']

export function isPurchasablePlan(planId: string): planId is PurchasablePlanId {
  return PURCHASABLE_PLAN_IDS.includes(planId)
}

export function isBillingPeriod(value: string): value is BillingPeriod {
  return BILLING_PERIODS.includes(value)
}

export interface ResolvedPurchase {
  planId: PurchasablePlanId
  billingPeriod: BillingPeriod
  amountIdr: number
  creditsGranted: number
}

export function resolvePurchase(
  planId: PurchasablePlanId,
  billingPeriod: BillingPeriod,
): ResolvedPurchase {
  const plan = getPlanById(planId)
  const yearly = billingPeriod === 'yearly'
  return {
    planId,
    billingPeriod,
    amountIdr: yearly ? plan.priceYearly : plan.priceMonthly,
    creditsGranted: yearly ? plan.credits * 12 : plan.credits,
  }
}
