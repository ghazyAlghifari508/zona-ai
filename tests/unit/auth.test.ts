/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

describe('auth config', () => {
  it('has google provider and emailAndPassword disabled', async () => {
    const { auth } = await import('../../src/lib/auth/auth')
    expect(
      (auth as unknown as { options: { socialProviders: { google: unknown } } })
        .options.socialProviders.google,
    ).toBeDefined()
    expect(
      (
        auth as unknown as {
          options: { emailAndPassword: { enabled: boolean } }
        }
      ).options.emailAndPassword.enabled,
    ).toBe(false)
  })

  it('uses drizzleAdapter pg', async () => {
    const { auth } = await import('../../src/lib/auth/auth')
    expect(
      (auth as unknown as { options: { database: unknown } }).options.database,
    ).toBeDefined()
  })
})

describe('auth client + helper', () => {
  it('authClient has signIn.social', async () => {
    const { authClient } = await import('../../src/lib/auth/auth-client')
    expect(typeof authClient.signIn.social).toBe('function')
  })

  it('getAuthSession throws 401 when no session', async () => {
    const { getAuthSession } = await import('../../src/lib/auth/session')
    await expect(
      getAuthSession(new Request('http://localhost/api/test')),
    ).rejects.toThrow('UNAUTHORIZED')
  })
})
