import { GemIcon, ZapIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useState } from 'react'
import { resetDevCreditsFn } from '../../server/functions/credits'

type Props = {
  credits: number
  onReset?: (newBalance: number) => void
  user?: {
    role?: string | null
    [key: string]: unknown
  } | null
}

export function CreditWidget({ credits, onReset, user }: Props) {
  const [balance, setBalance] = useState(credits)
  const [resetting, setResetting] = useState(false)

  // Stay in sync when the parent refreshes credits (e.g. after a send deducts)
  useEffect(() => setBalance(credits), [credits])

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

  const maxCredits = Math.max(100, balance)
  const percentage = Math.min(100, Math.max(0, (balance / maxCredits) * 100))
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
            {balance <= 100 && (
              <span className="font-sans text-[11px] font-normal text-stone">
                /100
              </span>
            )}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-paper">
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${
              isLow ? 'bg-coral' : 'bg-accent'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-stone">
          <span>
            {isLow
              ? 'Kredit menipis'
              : balance > 100
                ? 'Paket Tambahan'
                : 'Paket Standar'}
          </span>
          <span>
            {balance > 100
              ? `${balance} kredit`
              : `${Math.round(percentage)}% tersisa`}
          </span>
        </div>

        {user?.role === 'admin' && (
          <button
            type="button"
            data-testid="reset-credits-btn"
            onClick={handleReset}
            disabled={resetting}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-hairline bg-pure-white px-2.5 py-1.5 text-[12px] font-medium text-ink transition-all hover:border-hairline-strong hover:bg-stone/5 active:scale-95 disabled:opacity-50"
            title="Reset ke 100 kredit (Admin mode)"
          >
            <HugeiconsIcon
              icon={ZapIcon}
              size={13}
              strokeWidth={1.75}
              className="text-amber-500 shrink-0"
            />
            <span>{resetting ? 'Mereset...' : 'Reset 100 Kredit'}</span>
          </button>
        )}
      </div>
    </div>
  )
}
