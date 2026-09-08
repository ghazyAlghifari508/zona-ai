import { CheckIcon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMemo, useState } from 'react'
import type { Checklist } from '@/lib/chat/checklist'
import {
  getCompletedOverrides,
  setCompletedOverride,
} from '@/lib/chat/checklist-state'

export { clearCompletedOverrides } from '@/lib/chat/checklist-state'

type Props = {
  checklist: Checklist
  storageKey: string
  initialCompleted?: Record<string, boolean>
}

export function ChecklistView({
  checklist,
  storageKey,
  initialCompleted,
}: Props) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>(() => ({
    ...(initialCompleted ?? {}),
    ...getCompletedOverrides(storageKey),
  }))

  const items = useMemo(
    () =>
      checklist.items.map((item) => ({
        ...item,
        completed: overrides[item.id] ?? item.completed,
      })),
    [checklist.items, overrides],
  )
  const completedCount = items.filter((item) => item.completed).length

  const toggle = (itemId: string, next: boolean) => {
    setOverrides((prev) => ({ ...prev, [itemId]: next }))
    setCompletedOverride(storageKey, itemId, next)
  }

  return (
    <div
      data-testid="checklist-view"
      className="min-w-0 max-w-[560px] rounded-lg border border-hairline bg-pure-white px-4 py-3"
    >
      {checklist.title && (
        <div className="mb-2 text-[13px] font-semibold tracking-[-0.01em] text-ink">
          {checklist.title}
          <span
            data-testid="checklist-progress"
            className="ml-2 text-[12px] font-normal text-stone"
          >
            {completedCount}/{items.length}
          </span>
        </div>
      )}
      <ul className="m-0 list-none space-y-0.5 p-0">
        {items.map((item) => (
          <li
            key={item.id}
            data-testid={`checklist-item-${item.id}`}
            data-completed={item.completed}
          >
            <label className="flex w-full cursor-pointer items-start gap-2.5 rounded-md py-1.5 pr-2 transition-colors duration-200 hover:bg-ink/5">
              <span className="relative mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center">
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={(e) => toggle(item.id, e.target.checked)}
                  className="peer absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-[5px] border border-hairline-strong bg-pure-white transition-colors duration-200 checked:border-accent checked:bg-accent hover:not-checked:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-notion-blue"
                />
                <HugeiconsIcon
                  icon={CheckIcon}
                  size={12}
                  strokeWidth={2.5}
                  aria-hidden="true"
                  className="pointer-events-none relative text-pure-white opacity-0 transition-opacity duration-150 peer-checked:opacity-100"
                />
              </span>
              <span
                className={`min-w-0 flex-1 whitespace-pre-line text-[14px] leading-[1.55] [overflow-wrap:anywhere] transition-colors duration-200 ${
                  item.completed ? 'text-stone line-through' : 'text-ink'
                }`}
              >
                {item.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
