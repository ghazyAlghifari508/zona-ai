import { GemIcon, ZapIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { resetDevCreditsFn } from '@/server/functions/credits'

type Props = {
  credits: number
  onReset?: (newBalance: number) => void
}

export function CreditWidget({ credits, onReset }: Props) {
  const [balance, setBalance] = useState(credits)
  const [resetting, setResetting] = useState(false)

  // Stay in sync when the parent refreshes credits (e.g. after a send deducts)
  useEffect(() => setBalance(credits), [credits])

  const percentage = Math.min(100, Math.max(0, (balance / 100) * 100))
  const isLow = balance < 20

  const handleReset = async () => {
    if (resetting) return
    setResetting(true)
    try {
      const res = await resetDevCreditsFn()
      setBalance(res.newBalance)
      onReset?.(res.newBalance)
    } catch (e) {
      console.error(e)
    } finally {
      setResetting(false)
    }
  }

  return (
    <div data-testid="credit-widget" className="border-t border-hairline p-4">
      <div className="flex items-center gap-2 text-[15px] font-medium text-ink">
        <HugeiconsIcon
          icon={GemIcon}
          size={16}
          strokeWidth={1.75}
          className="text-stone"
        />
        <span data-testid="credit-balance">{balance} Kredit</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-paper">
        <div
          className={`h-full rounded-full transition-all ${isLow ? 'bg-coral' : 'bg-notion-blue'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {process.env.NODE_ENV !== 'production' && (
        <button
          type="button"
          data-testid="reset-credits-btn"
          onClick={handleReset}
          disabled={resetting}
          className="mt-3 flex items-center gap-1 rounded-md border border-hairline-strong px-3 py-1 text-xs font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
        >
          <HugeiconsIcon icon={ZapIcon} size={12} strokeWidth={1.75} />
          {resetting ? 'Mereset...' : 'Reset 100'}
        </button>
      )}
    </div>
  )
}
