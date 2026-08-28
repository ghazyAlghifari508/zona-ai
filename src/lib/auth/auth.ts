import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '../db/index'

if (typeof window !== 'undefined') {
  throw new Error('src/lib/auth/auth.ts is server-only — do not import on the client')
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true }),
  emailAndPassword: { enabled: false },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [tanstackStartCookies()],
  session: {
    cookieName: 'zona_session',
    expiresIn: 60 * 60 * 24 * 30,
    cookieCache: { enabled: true },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
})
