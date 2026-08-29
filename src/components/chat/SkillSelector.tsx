import {
  Bot,
  Check,
  ClipboardList,
  FileText,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const SKILLS = [
  { id: 'none', label: 'Tanpa skill', icon: Sparkles, desc: 'Jawaban natural' },
  {
    id: 'checklist',
    label: 'Checklist',
    icon: ClipboardList,
    desc: 'Checklist terstruktur',
  },
  {
    id: 'prd-plan',
    label: 'PRD Plan',
    icon: FileText,
    desc: 'Objective â†’ DoD',
  },
  {
    id: 'agent-skill',
    label: 'Agent Skill',
    icon: Bot,
    desc: 'SKILL.md modular',
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
          className="flex items-center gap-1.5 rounded-full border border-hairline-mist bg-pure-white px-3 py-1.5 text-[13px] text-ink-black hover:bg-sandstone"
        >
          <Wrench size={14} strokeWidth={1.75} className="text-stone-deep" />
          <span>{selected.label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[280px] rounded-[10px] border border-hairline-mist bg-pure-white p-2"
      >
        <div className="mb-2 px-2 py-1 text-xs font-medium tracking-wide text-stone-deep">
          PILIH SKILL
        </div>
        <div className="space-y-1">
          {SKILLS.map((s) => {
            const Icon = s.icon
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
                className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left hover:bg-sandstone ${isActive ? 'bg-cream-paper' : ''}`}
              >
                <Icon size={16} strokeWidth={1.75} className="text-ink-black" />
                <div className="flex-1">
                  <div className="text-[14px] font-medium text-ink-black">
                    {s.label}
                  </div>
                  <div className="text-xs text-stone-deep">{s.desc}</div>
                </div>
                {isActive && (
                  <Check
                    size={16}
                    strokeWidth={1.75}
                    className="text-fresh-grass"
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
