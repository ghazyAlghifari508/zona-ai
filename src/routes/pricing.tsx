import { createFileRoute } from '@tanstack/react-router'
import { PricingSection } from '@/components/pricing/PricingSection'

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
})

function PricingPage() {
  return (
    <div className="min-h-screen bg-pure-white">
      <main>
        <PricingSection />
      </main>
    </div>
  )
}
