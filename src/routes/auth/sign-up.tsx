import { Loading03Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useState } from 'react'
import { PublicShell } from '@/components/layout/PublicShell'
import { authClient } from '@/lib/auth/auth-client'

export const Route = createFileRoute('/auth/sign-up')({
  beforeLoad: async () => {
    const { data } = await authClient.getSession()
    if (data?.user) {
      throw redirect({ to: '/chat' })
    }
  },
  component: SignUp,
})

function SignUp() {
  const [loading, setLoading] = useState(false)

  const handleGoogle = async () => {
    setLoading(true)
    try {
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <PublicShell>
      <div className="flex min-h-[80vh] items-center justify-center bg-paper px-4">
        <div
          data-testid="auth-card"
          className="w-full max-w-[420px] rounded-lg border border-hairline bg-pure-white p-10"
        >
          <h1 className="text-center text-[24px] font-bold tracking-[-0.02em] text-ink">
            Daftar ke Zona.ai
          </h1>
          <p className="mt-2 text-center text-[15px] text-stone">
            Satu klik untuk mulai membandingkan model AI.
          </p>
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-md border border-hairline-strong bg-pure-white px-5 py-3 text-[15px] font-medium text-ink hover:bg-ink/5 disabled:opacity-50"
          >
            {loading ? (
              <HugeiconsIcon
                icon={Loading03Icon}
                size={20}
                className="animate-spin"
                aria-hidden="true"
              />
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09A6.97 6.97 0 0 1 5.48 12c0-.73.13-1.43.36-2.09V7.07H2.18A10.98 10.98 0 0 0 1 12c0 1.78.42 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            )}
            Continue with Google
          </button>
        </div>
      </div>
    </PublicShell>
  )
}
