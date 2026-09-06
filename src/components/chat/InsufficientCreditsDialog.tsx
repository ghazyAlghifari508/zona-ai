import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function InsufficientCreditsDialog({
  open,
  onOpenChange,
  onViewPlans,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onViewPlans: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="insufficient-credits-dialog">
        <DialogHeader>
          <DialogTitle>Kredit habis</DialogTitle>
          <DialogDescription>
            Kredit kamu habis sehingga pesan tidak bisa diproses. Top up paket
            untuk lanjut chat.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            data-testid="insufficient-credits-close"
            onClick={() => onOpenChange(false)}
            className="flex h-10 items-center justify-center rounded-md border border-hairline-strong bg-pure-white px-4 text-[14px] font-medium text-ink transition-colors duration-200 hover:bg-ink/5"
          >
            Tutup
          </button>
          <button
            type="button"
            data-testid="insufficient-credits-view-plans"
            onClick={onViewPlans}
            className="flex h-10 items-center justify-center rounded-md bg-notion-blue px-4 text-[14px] font-medium text-pure-white transition-colors duration-200 hover:bg-blue-hover"
          >
            Lihat Paket
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
