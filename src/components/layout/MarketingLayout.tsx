import type { ReactNode } from 'react'
import { GlobalNav } from './GlobalNav'

type Props = {
  user?: { name?: string | null; email?: string | null } | null
  authState: 'loading' | 'authenticated' | 'unauthenticated'
  onSignIn?: () => void
  signingIn?: boolean
  title: ReactNode
  subtitle: string
  maxWidth?: 'narrow' | 'wide'
  children: ReactNode
}

export function MarketingLayout({
  user,
  authState,
  onSignIn,
  signingIn,
  title,
  subtitle,
  maxWidth = 'narrow',
  children,
}: Props) {
  const containerMaxWidth = maxWidth === 'wide' ? 'max-w-5xl' : 'max-w-[760px]'

  return (
    <div className="min-h-screen bg-pure-white">
      <GlobalNav
        user={user}
        authState={authState}
        onSignIn={onSignIn}
        signingIn={signingIn}
        mode="marketing"
      />
      <main className="mx-auto w-full px-4 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className={`mx-auto w-full ${containerMaxWidth}`}>
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold tracking-tight text-ink md:text-4xl">
              {title}
            </h1>
            <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-graphite">
              {subtitle}
            </p>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}
