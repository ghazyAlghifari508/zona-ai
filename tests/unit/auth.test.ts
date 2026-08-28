/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'

describe('auth config', () => {
  it('has google provider and emailAndPassword disabled', async () => {
    const { auth } = await import('../../src/lib/auth/auth')
    expect((auth as unknown as { options: { socialProviders: { google: unknown } } }).options.socialProviders.google).toBeDefined()
    expect((auth as unknown as { options: { emailAndPassword: { enabled: boolean } } }).options.emailAndPassword.enabled).toBe(false)
  })

  it('uses drizzleAdapter pg', async () => {
    const { auth } = await import('../../src/lib/auth/auth')
    expect((auth as unknown as { options: { database: unknown } }).options.database).toBeDefined()
  })
})
