import { createFileRoute } from '@tanstack/react-router'
import { HelpSection } from '@/components/pricing/HelpSection'

export const Route = createFileRoute('/bantuan')({
  component: BantuanPage,
})

function BantuanPage() {
  return (
    <div className="min-h-screen bg-pure-white">
      <main>
        <HelpSection />
      </main>
    </div>
  )
}
