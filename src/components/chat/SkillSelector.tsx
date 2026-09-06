import {
  ArrowDown01Icon,
  CheckListIcon,
  File01Icon,
  Message01Icon,
  SourceCodeIcon,
  Tick01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  getSkillDefinition,
  SKILL_IDS,
  skillSupportsCompare,
} from '@/lib/chat/skills'

const SKILL_ICONS = {
  none: Message01Icon,
  checklist: CheckListIcon,
  'prd-plan': File01Icon,
  'agent-skill': SourceCodeIcon,
} as const

export const SKILLS = SKILL_IDS.map((id) => {
  const def = getSkillDefinition(id)
  return { ...def, icon: SKILL_ICONS[def.id] }
})

type Props = {
  value: string
  onChange: (id: string) => void
  compareEnabled?: boolean
}

export function SkillSelector({ value, onChange, compareEnabled }: Props) {
  const [open, setOpen] = useState(false)
  const selected = SKILLS.find((s) => s.id === value) ?? SKILLS[0]

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="skill-selector-trigger"
          className="flex h-8 items-center gap-1.5 rounded-full border border-hairline bg-pure-white px-2.5 text-ink transition-all duration-200 hover:bg-ink/5 active:scale-95"
        >
          <HugeiconsIcon
            icon={selected.icon}
            size={14}
            strokeWidth={1.75}
            className="text-ink"
          />
          <span className="text-[13px] font-medium tracking-[-0.01em]">
            {selected.label}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={13}
            strokeWidth={1.75}
            className="text-ink/40"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[280px] rounded-lg border border-hairline bg-pure-white p-2 shadow-[0_8px_24px_rgba(0,0,0,0.08)]"
      >
        <div className="mb-2 px-2 py-1 text-[10px] font-bold tracking-[0.11em] text-ink/40 uppercase">
          PILIH SKILL
        </div>
        <div className="space-y-1">
          {SKILLS.map((s) => {
            const isActive = value === s.id
            const isBlocked = !skillSupportsCompare(s.id) && compareEnabled
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`skill-option-${s.id}`}
                disabled={isBlocked}
                onClick={() => {
                  if (isBlocked) return
                  onChange(s.id)
                  setOpen(false)
                }}
                title={
                  isBlocked
                    ? 'Hanya tersedia untuk mode single model'
                    : undefined
                }
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-200 ${
                  isBlocked
                    ? 'cursor-not-allowed opacity-40'
                    : isActive
                      ? 'bg-paper'
                      : 'hover:bg-ink/5'
                }`}
              >
                <HugeiconsIcon
                  icon={s.icon}
                  size={16}
                  strokeWidth={1.75}
                  className="text-ink"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[14px] font-bold tracking-[-0.015em] text-ink">
                      {s.label}
                    </span>
                    {isBlocked && (
                      <span className="rounded bg-paper px-1.5 py-0.2 font-mono text-[9px] font-medium uppercase text-stone">
                        Single Only
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-stone">
                    {isBlocked ? 'Tidak tersedia di Compare Mode' : s.desc}
                  </div>
                </div>
                {isActive && !isBlocked && (
                  <HugeiconsIcon
                    icon={Tick01Icon}
                    size={16}
                    strokeWidth={1.75}
                    className="text-notion-blue"
                  />
                )}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
