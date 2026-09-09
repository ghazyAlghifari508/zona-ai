import { createFileRoute } from '@tanstack/react-router'
import { ErrorView } from '@/components/layout/ErrorView'

export const Route = createFileRoute('/error')({
  component: ErrorPage,
})

function ErrorPage() {
  return <ErrorView />
}
