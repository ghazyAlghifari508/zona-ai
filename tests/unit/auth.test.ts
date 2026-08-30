/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'

import { auth } from '../../src/lib/auth/auth'

describe('auth config', () => {
  it(
    'has google provider and emailAndPassword disabled',
    async () => {
      expect(
        (
          auth as unknown as {
            options: { socialProviders: { google: unknown } }
          }
        ).options.socialProviders.google,
      ).toBeDefined()
      expect(
        (
          auth as unknown as {
            options: { emailAndPassword: { enabled: boolean } }
          }
        ).options.emailAndPassword.enabled,
      ).toBe(false)
    },
    30000,
  )

  it(
    'uses drizzleAdapter pg',
    async () => {
      expect(
        (auth as unknown as { options: { database: unknown } }).options
          .database,
      ).toBeDefined()
    },
    30000,
  )
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

  it('getOptionalAuthSession returns null when no session', async () => {
    const { getOptionalAuthSession } = await import(
      '../../src/lib/auth/session'
    )
    const session = await getOptionalAuthSession(
      new Request('http://localhost/api/test'),
    )
    expect(session).toBeNull()
  })
})
