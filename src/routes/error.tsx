import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { ErrorView } from '@/components/layout/ErrorView'

const errorSearchSchema = z.object({
  code: z.string().optional(),
})

export const Route = createFileRoute('/error')({
  validateSearch: errorSearchSchema,
  component: ErrorPage,
})

function ErrorPage() {
  const { code } = Route.useSearch()
  const error = code === '403' ? { status: 403 } : undefined
  return <ErrorView error={error} />
}
