import { Gem, Zap } from 'lucide-react'
import { resetDevCreditsFn } from '@/server/functions/credits'

type Props = {
  credits: number
  onReset?: (newBalance: number) => void
}

export function CreditWidget({ credits, onReset }: Props) {
  const percentage = Math.min(100, Math.max(0, (credits / 100) * 100))
  const isLow = credits < 20

  const handleReset = async () => {
    try {
      const res = await resetDevCreditsFn()
      onReset?.(res.newBalance)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div
      data-testid="credit-widget"
      className="border-t border-hairline-mist p-4"
    >
      <div className="flex items-center gap-2 text-[15px] font-medium text-ink-black">
        <Gem size={16} strokeWidth={1.75} className="text-stone-deep" />
        <span>{credits} Kredit</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sandstone">
        <div
          className={`h-full rounded-full transition-all ${isLow ? 'bg-coral-pop' : 'bg-fresh-grass'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <button
          type="button"
          data-testid="reset-credits-btn"
          onClick={handleReset}
          className="mt-3 flex items-center gap-1 rounded-full border border-ink-black px-3 py-1 text-xs font-medium text-ink-black hover:bg-sandstone"
        >
          <Zap size={12} strokeWidth={1.75} />
          Reset 100
        </button>
      )}
    </div>
  )
}
