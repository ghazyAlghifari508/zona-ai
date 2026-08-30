import { GemIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'

type Props = {
  credits: number
  onReset?: (newBalance: number) => void
}

export function CreditWidget({ credits }: Props) {
  const [balance, setBalance] = useState(credits)

  // Stay in sync when the parent refreshes credits (e.g. after a send deducts)
  useEffect(() => setBalance(credits), [credits])

  const percentage = Math.min(100, Math.max(0, (balance / 100) * 100))
  const isLow = balance < 20

  return (
    <div data-testid="credit-widget" className="p-3">
      <div className="rounded-xl border border-hairline bg-pure-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-sky-tint text-notion-blue">
              <HugeiconsIcon icon={GemIcon} size={14} strokeWidth={2} />
            </span>
            <span className="text-[12px] font-semibold tracking-[-0.01em] text-ink">
              Kredit Tersedia
            </span>
          </div>
          <span
            data-testid="credit-balance"
            className="font-mono text-[13px] font-bold text-ink"
          >
            {balance}
            <span className="font-sans text-[11px] font-normal text-stone">
              /100
            </span>
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-paper">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isLow ? 'bg-coral' : 'bg-notion-blue'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-stone">
          <span>{isLow ? 'Kredit menipis' : 'Paket Standar'}</span>
          <span>{Math.round(percentage)}% tersisa</span>
        </div>
      </div>
    </div>
  )
}
