import { createFileRoute } from '@tanstack/react-router'
import { FaqSection } from '@/components/pricing/FaqSection'

export const Route = createFileRoute('/faq')({
  component: FaqPage,
})

function FaqPage() {
  return (
    <div className="min-h-screen bg-pure-white">
      <main>
        <FaqSection />
      </main>
    </div>
  )
}
