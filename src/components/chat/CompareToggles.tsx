import { Columns2, MessageSquare } from "lucide-react"

type Props = {
  mode: "normal" | "compare"
  onChange: (m: "normal" | "compare") => void
}

export function CompareToggles({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-full border border-hairline-mist bg-pure-white p-1" data-testid="compare-toggles">
      <button
        type="button"
        data-testid="compare-toggle-standard"
        onClick={() => onChange("normal")}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-medium ${
          mode === "normal" ? "bg-sandstone border border-ink-black text-ink-black" : "text-stone-gray hover:text-ink-black"
        }`}
      >
        <MessageSquare size={12} strokeWidth={1.75} />
        Standard
      </button>
      <button
        type="button"
        data-testid="compare-toggle"
        onClick={() => onChange("compare")}
        className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-medium ${
          mode === "compare" ? "bg-sandstone border border-ink-black text-ink-black" : "text-stone-gray hover:text-ink-black"
        }`}
      >
        <Columns2 size={12} strokeWidth={1.75} />
        Compare
      </button>
    </div>
  )
}
