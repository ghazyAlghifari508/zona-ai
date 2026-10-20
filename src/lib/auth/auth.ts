import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { tanstackStartCookies } from 'better-auth/tanstack-start'
import { db } from '../db/index'
import { env } from '../env.server'

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/auth/auth.ts is server-only — do not import on the client',
  )
}

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins:
    env.NODE_ENV === 'development'
      ? ['http://localhost:*', 'http://127.0.0.1:*']
      : [env.APP_URL],
  database: drizzleAdapter(db, { provider: 'pg', usePlural: true }),
  emailAndPassword: { enabled: false },
  user: {
    additionalFields: {
      role: { type: 'string', defaultValue: 'user', input: false },
      banned: { type: 'boolean', defaultValue: false, input: false },
      banReason: { type: 'string', required: false, input: false },
      banExpires: { type: 'date', required: false, input: false },
    },
  },
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    },
  },
  plugins: [tanstackStartCookies()],
  session: {
    cookieName: 'zona_session',
    expiresIn: 60 * 60 * 24 * 30,
    cookieCache: { enabled: false },
  },
  advanced: {
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
})
