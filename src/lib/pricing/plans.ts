export type PlanId = 'free' | 'pro' | 'ultra'

export interface PricingPlan {
  id: PlanId
  name: string
  tagline: string
  priceMonthly: number
  priceYearly: number
  credits: number
  popular?: boolean
  current?: boolean
  highlight: {
    card: string
    button: string
  }
  features: Array<{ text: string; included: boolean }>
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
    current: true,
    highlight: {
      card: 'bg-pure-white',
      button: 'bg-ink text-pure-white hover:bg-ink/90',
    },
    features: [
      { text: '100 kredit per bulan', included: true },
      { text: 'Akses semua model AI', included: true },
      { text: 'Compare Mode hingga 2 model', included: true },
      { text: 'Pencarian web (Tavily)', included: true },
      { text: 'Prioritas kecepatan', included: false },
      { text: 'Dukungan prioritas', included: false },
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
      card: 'bg-sky-tint',
      button: 'bg-notion-blue text-pure-white hover:bg-blue-hover',
    },
    features: [
      { text: '2.000 kredit per bulan', included: true },
      { text: 'Akses semua model AI', included: true },
      { text: 'Compare Mode hingga 4 model', included: true },
      { text: 'Pencarian web (Tavily)', included: true },
      { text: 'Prioritas kecepatan', included: true },
      { text: 'Dukungan prioritas', included: false },
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
      card: 'bg-midnight text-pure-white',
      button: 'bg-pure-white text-ink hover:bg-pure-white/90',
    },
    features: [
      { text: '10.000 kredit per bulan', included: true },
      { text: 'Akses semua model AI', included: true },
      { text: 'Compare Mode hingga 4 model', included: true },
      { text: 'Pencarian web (Tavily)', included: true },
      { text: 'Prioritas kecepatan', included: true },
      { text: 'Dukungan prioritas', included: true },
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
