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

export const SKILLS = [
  {
    id: 'none',
    label: 'Tanpa skill',
    icon: Message01Icon,
    desc: 'Jawaban natural',
    example: 'Tanyakan apa saja ke Zona.ai...',
  },
  {
    id: 'checklist',
    label: 'Checklist',
    icon: CheckListIcon,
    desc: 'Checklist terstruktur',
    example: 'Buatkan checklist untuk ',
  },
  {
    id: 'prd-plan',
    label: 'PRD Plan',
    icon: File01Icon,
    desc: 'Objective → DoD',
    example: 'Buatkan PRD untuk ',
  },
  {
    id: 'agent-skill',
    label: 'Agent Skill',
    icon: SourceCodeIcon,
    desc: 'SKILL.md modular',
    example: 'Buatkan SKILL.md untuk ',
  },
] as const

type Props = {
  value: string
  onChange: (id: string) => void
}

export function SkillSelector({ value, onChange }: Props) {
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
            return (
              <button
                key={s.id}
                type="button"
                data-testid={`skill-option-${s.id}`}
                onClick={() => {
                  onChange(s.id)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-200 ${isActive ? 'bg-paper' : 'hover:bg-ink/5'}`}
              >
                <HugeiconsIcon
                  icon={s.icon}
                  size={16}
                  strokeWidth={1.75}
                  className="text-ink"
                />
                <div className="flex-1">
                  <div className="text-[14px] font-bold tracking-[-0.015em] text-ink">
                    {s.label}
                  </div>
                  <div className="text-xs text-stone">{s.desc}</div>
                </div>
                {isActive && (
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
